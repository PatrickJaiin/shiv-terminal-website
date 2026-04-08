import { getYouTubeKeys, ytFetch } from "../../../lib/youtube-keys";

const YT_API = "https://www.googleapis.com/youtube/v3";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { videoId } = req.body;
    const keys = getYouTubeKeys(req.body.youtubeApiKey);

    if (keys.length === 0) return res.status(400).json({ error: "YouTube API key required" });
    if (!videoId) return res.status(400).json({ error: "videoId is required" });

    // 1. Fetch video statistics
    const videoData = await ytFetch(
      (key) => `${YT_API}/videos?part=statistics,snippet&id=${videoId}&key=${key}`,
      keys
    );
    if (!videoData.items?.length) {
      return res.status(404).json({ error: "Video not found" });
    }

    const video = videoData.items[0];
    const stats = video.statistics;
    const views = parseFloat(stats.viewCount) || 0;
    const likes = parseFloat(stats.likeCount) || 0;
    const comments = parseFloat(stats.commentCount) || 0;
    const channelId = video.snippet.channelId;
    const title = video.snippet.title;

    // 2. Fetch channel statistics + uploads playlist
    const channelData = await ytFetch(
      (key) => `${YT_API}/channels?part=statistics,contentDetails&id=${channelId}&key=${key}`,
      keys
    );
    if (!channelData.items?.length) {
      return res.status(404).json({ error: "Channel not found" });
    }

    const channel = channelData.items[0];
    const subscribers = parseFloat(channel.statistics.subscriberCount) || 0;
    const uploadsPlaylist = channel.contentDetails.relatedPlaylists.uploads;

    // 3. Fetch last 10 videos from the channel
    const playlistData = await ytFetch(
      (key) => `${YT_API}/playlistItems?part=snippet&playlistId=${uploadsPlaylist}&maxResults=10&key=${key}`,
      keys
    );
    const recentVideoIds = (playlistData.items || [])
      .map((item) => item.snippet.resourceId.videoId)
      .filter(Boolean);

    // 4. Fetch stats for last 10 videos
    let avgViews = views;
    let avgLikes = likes;
    let avgComments = comments;

    if (recentVideoIds.length > 0) {
      const recentStats = await ytFetch(
        (key) => `${YT_API}/videos?part=statistics&id=${recentVideoIds.join(",")}&key=${key}`,
        keys
      );
      const recentItems = recentStats.items || [];
      if (recentItems.length > 0) {
        let totalViews = 0, totalLikes = 0, totalComments = 0;
        for (const item of recentItems) {
          totalViews += parseFloat(item.statistics.viewCount) || 0;
          totalLikes += parseFloat(item.statistics.likeCount) || 0;
          totalComments += parseFloat(item.statistics.commentCount) || 0;
        }
        avgViews = totalViews / recentItems.length;
        avgLikes = totalLikes / recentItems.length;
        avgComments = totalComments / recentItems.length;
      }
    }

    // 5. Compute weight using paper formulas
    //    Popularity = Views * Subscribers
    //    Engagement = (Likes + Comments) / (2 * Views)
    //    Sentiment  = Likes / Views
    //    Consistency = (avgLikes + avgComments + avgViews) / avgViews
    //    W = (Popularity * Engagement * Sentiment) + Consistency
    //    W = -1/W  (flooring function)

    const popularity = views * subscribers;
    const engagement = views > 0 ? (likes + comments) / (2 * views) : 0;
    const sentiment = views > 0 ? likes / views : 0;
    const consistency = avgViews > 0 ? (avgLikes + avgComments + avgViews) / avgViews : 1;

    let W = popularity * engagement * sentiment + consistency;
    if (W !== 0) {
      W = -1 / W; // Flooring function from the paper
    }

    return res.status(200).json({
      videoId,
      title,
      views,
      likes,
      comments,
      subscribers,
      avgViews: Math.round(avgViews),
      avgLikes: Math.round(avgLikes),
      avgComments: Math.round(avgComments),
      popularity,
      engagement: Math.round(engagement * 10000) / 10000,
      sentiment: Math.round(sentiment * 10000) / 10000,
      consistency: Math.round(consistency * 10000) / 10000,
      weight: W,
    });
  } catch (err) {
    console.error("Stats error:", err);
    return res.status(500).json({ error: err.message || "Stats fetch failed" });
  }
}
