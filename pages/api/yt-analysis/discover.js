import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { getYouTubeKeys, ytFetch } from "../../../lib/youtube-keys";

const YT_API = "https://www.googleapis.com/youtube/v3";

async function searchYouTube(query, maxResults, keys) {
  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    maxResults: String(maxResults),
  });
  const data = await ytFetch((key) => `${YT_API}/search?${params}&key=${key}`, keys);
  return (data.items || []).map((item) => ({
    id: item.id.videoId,
    title: item.snippet.title,
    channel: item.snippet.channelTitle,
    channelId: item.snippet.channelId,
    thumbnail: item.snippet.thumbnails?.medium?.url || "",
  }));
}

function buildGraph(searchSets) {
  const graph = new Graph({ type: "undirected" });
  const videoMap = new Map();

  // Add all unique videos as nodes
  for (const { results } of searchSets) {
    for (const video of results) {
      if (!videoMap.has(video.id)) {
        videoMap.set(video.id, video);
        graph.addNode(video.id, {
          title: video.title,
          channel: video.channel,
          channelId: video.channelId,
          thumbnail: video.thumbnail,
          x: Math.random() * 100,
          y: Math.random() * 100,
        });
      }
    }
  }

  // Build edges: videos within the same search result set that are close
  // in rank are connected (window of +-4 positions)
  for (const { results } of searchSets) {
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j <= Math.min(i + 4, results.length - 1); j++) {
        const a = results[i].id;
        const b = results[j].id;
        if (a === b) continue;
        const edgeWeight = 1 / (j - i); // closer results = stronger connection
        if (graph.hasEdge(a, b)) {
          graph.updateEdgeAttribute(a, b, "weight", (w) => (w || 0) + edgeWeight);
        } else {
          try {
            graph.addEdge(a, b, { weight: edgeWeight });
          } catch {
            // edge might already exist in undirected graph
          }
        }
      }
    }
  }

  // Add edges between videos from same channel
  const channelGroups = new Map();
  for (const [id, video] of videoMap) {
    if (!channelGroups.has(video.channelId)) channelGroups.set(video.channelId, []);
    channelGroups.get(video.channelId).push(id);
  }
  for (const ids of channelGroups.values()) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (!graph.hasEdge(ids[i], ids[j])) {
          try {
            graph.addEdge(ids[i], ids[j], { weight: 0.5 });
          } catch {
            // skip
          }
        }
      }
    }
  }

  return graph;
}

function layoutAndCluster(graph) {
  if (graph.order < 2) return { communities: {}, positions: {} };

  // ForceAtlas2 layout
  const settings = {
    iterations: 80,
    settings: {
      gravity: 1,
      scalingRatio: 2,
      strongGravityMode: true,
      barnesHutOptimize: graph.order > 100,
    },
  };
  forceAtlas2.assign(graph, settings);

  // Louvain community detection
  const communities = louvain(graph);

  return communities;
}

function selectComparisonVideos(graph, communities, maxPerCommunity = 3, maxTotal = 15) {
  // Group nodes by community
  const communityGroups = new Map();
  graph.forEachNode((nodeId) => {
    const comm = communities[nodeId] ?? 0;
    if (!communityGroups.has(comm)) communityGroups.set(comm, []);
    communityGroups.get(comm).push({
      id: nodeId,
      inDegree: graph.degree(nodeId),
      title: graph.getNodeAttribute(nodeId, "title"),
      channel: graph.getNodeAttribute(nodeId, "channel"),
      thumbnail: graph.getNodeAttribute(nodeId, "thumbnail"),
    });
  });

  // Sort each community by in-degree, pick top N
  const selected = [];
  for (const [commId, nodes] of communityGroups) {
    nodes.sort((a, b) => b.inDegree - a.inDegree);
    const picks = nodes.slice(0, maxPerCommunity);
    for (const pick of picks) {
      selected.push({ ...pick, community: commId });
    }
  }

  // Limit total
  selected.sort((a, b) => b.inDegree - a.inDegree);
  return selected.slice(0, maxTotal);
}

function serializeGraph(graph, communities) {
  // Normalize positions to 0-1
  const xs = [];
  const ys = [];
  graph.forEachNode((_, attrs) => {
    xs.push(attrs.x);
    ys.push(attrs.y);
  });
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const nodes = [];
  graph.forEachNode((id, attrs) => {
    nodes.push({
      id,
      title: attrs.title,
      channel: attrs.channel,
      thumbnail: attrs.thumbnail,
      x: (attrs.x - minX) / rangeX,
      y: (attrs.y - minY) / rangeY,
      community: communities[id] ?? 0,
      degree: graph.degree(id),
    });
  });

  const edges = [];
  graph.forEachEdge((_, attrs, source, target) => {
    edges.push({ source, target });
  });

  // Community stats
  const commStats = new Map();
  for (const node of nodes) {
    if (!commStats.has(node.community)) commStats.set(node.community, 0);
    commStats.set(node.community, commStats.get(node.community) + 1);
  }
  const communityList = Array.from(commStats.entries())
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count);

  return { nodes, edges, communities: communityList };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { searchQuery, depth = 2, maxPerCommunity = 3, maxTotal = 15 } = req.body;
    const keys = getYouTubeKeys(req.body.youtubeApiKey);

    if (keys.length === 0) return res.status(400).json({ error: "YouTube API key required. Set YOUTUBE_API_KEY env var or pass youtubeApiKey." });
    if (!searchQuery) return res.status(400).json({ error: "searchQuery is required" });

    const searchSets = [];

    // Phase 1: Main search — get 50 results (max)
    const mainResults = await searchYouTube(searchQuery, 50, keys);
    searchSets.push({ query: searchQuery, results: mainResults });

    // Phase 2: Depth 1 — search titles of top 10 results
    const depth1Videos = mainResults.slice(0, Math.min(10, mainResults.length));
    for (const video of depth1Videos) {
      const cleanTitle = video.title
        .replace(/[^\w\s]/g, "")
        .split(" ")
        .slice(0, 8)
        .join(" ");
      if (cleanTitle.length < 5) continue;
      try {
        const related = await searchYouTube(cleanTitle, 25, keys);
        searchSets.push({ query: cleanTitle, results: related });
      } catch {
        // Skip failed searches
      }
    }

    // Phase 3: Depth 2+ — for newly discovered videos, search their titles too
    const allSeenIds = new Set(mainResults.map((v) => v.id));
    for (let d = 2; d <= Math.min(depth, 5); d++) {
      const prevSets = searchSets.slice();
      const newVideos = [];
      for (const ss of prevSets) {
        for (const v of ss.results) {
          if (!allSeenIds.has(v.id)) {
            allSeenIds.add(v.id);
            newVideos.push(v);
          }
        }
      }
      // Scale search breadth with depth
      const searchCount = { 2: 5, 3: 8, 4: 10, 5: 12 }[d] || 8;
      const toSearch = newVideos.slice(0, searchCount);
      for (const video of toSearch) {
        const cleanTitle = video.title
          .replace(/[^\w\s]/g, "")
          .split(" ")
          .slice(0, 8)
          .join(" ");
        if (cleanTitle.length < 5) continue;
        try {
          const resultsPerSearch = { 2: 20, 3: 25, 4: 30, 5: 35 }[d] || 25;
          const related = await searchYouTube(cleanTitle, resultsPerSearch, keys);
          searchSets.push({ query: cleanTitle, results: related });
        } catch {
          // Skip
        }
      }
    }

    // Phase 4: Build graph
    const graph = buildGraph(searchSets);

    if (graph.order < 3) {
      return res.status(400).json({ error: "Not enough videos found. Try a different search query." });
    }

    // Phase 5: Layout + community detection
    const communities = layoutAndCluster(graph);

    // Phase 6: Select comparison videos
    const selectedVideos = selectComparisonVideos(graph, communities, maxPerCommunity, maxTotal);

    // Phase 7: Serialize
    const serialized = serializeGraph(graph, communities);
    const selectedIds = new Set(selectedVideos.map((v) => v.id));
    serialized.nodes.forEach((n) => {
      n.selected = selectedIds.has(n.id);
    });

    return res.status(200).json({
      ...serialized,
      selectedVideos,
      totalVideos: graph.order,
      totalEdges: graph.size,
    });
  } catch (err) {
    console.error("Discover error:", err);
    return res.status(500).json({ error: err.message || "Discovery failed" });
  }
}
