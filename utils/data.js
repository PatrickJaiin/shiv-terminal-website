export const siteData = {
  name: "Shiv Gupta",
  tagline: "MS AI Student @ CMU - Building LLM agents, latent reasoning systems & scalable backends",
  about:
    "Hi, I'm Shiv - a Master's student in Artificial Intelligence and Innovation at Carnegie Mellon University. I build LLM agents, latent reasoning systems, token-efficient reasoning techniques, and scalable backends. Previously I've worked on diffusion-based generative models at NUS and RAG-powered enterprise tools at Evalueserve.",
  education: [
    {
      institution: "Carnegie Mellon University",
      degree: "Master of Science in Artificial Intelligence and Innovation",
      gpa: "GPA: 3.33/4",
      date: "May 2027",
      coursework: "Computer Systems, AI & Future Markets, LLM Applications, Deep Learning, Computer Vision",
    },
    {
      institution: "Bennett University",
      degree: "Bachelor of Technology, Computer Science and Engineering",
      gpa: "CGPA: 8.75/10",
      date: "May 2024",
      coursework: "Algorithms, AI/ML, Deep Learning, NLP, HPC, OS, Prob & Statistics, Data Structures",
    },
    {
      institution: "Modern School, Barakhamba Road",
      degree: "School",
      gpa: null,
      date: null,
      coursework: null,
      activities: "President, Science Club | Vice President, Bits N Bytes (Computer Club)",
    },
  ],
  skills: {
    ai: ["Python", "CUDA Python", "TensorFlow", "PyTorch", "Deep Learning", "Computer Vision", "NLP", "Cloud Computing"],
    programming: ["Java", "Spring Boot", "C", "C++", "Verilog", "ReactJS", "Tailwind CSS", "Flask", "Django", "SQL", "MongoDB"],
    other: ["RAG", "Multi-Agent Systems", "Chain-of-Thought", "Context Management", "RESTful APIs", "Microservices", "Embedded Systems"],
  },
  projects: [
    {
      name: "Latent Reasoning Architecture for LLMs",
      description:
        "Multi-agent cognitive architecture enabling latent-space idle reasoning via hidden-state recurrence, leveraging ReAct and Chain-of-Thought with a gated memory system. Benchmarked against COCONUT and Sleep-Time Compute on GSM-Symbolic and AIME datasets.",
      stack: ["Python", "PyTorch", "LLMs"],
      link: null,
      year: "2026",
    },
    {
      name: "Who is Harry Potter",
      description:
        "Replication and extension of the 'Who is Harry Potter?' unlearning experiment - selectively erasing specific knowledge from LLMs while preserving general capabilities.",
      stack: ["Python", "PyTorch", "LLMs"],
      link: "https://github.com/PatrickJaiin/who-is-harry-potter",
      year: "2026",
    },
    {
      name: "Diffusion Based Generative Modelling for Architectural Visualization",
      description:
        "Developed Diffusion and ControlNet based Interior & Exterior design generation models at the National University of Singapore. Research on applying generative AI techniques for architectural visualization and design under the guidance of Dr Tan Wee Kek.",
      stack: ["Python", "Diffusion Models", "ControlNet", "Computer Vision"],
      link: "/projects/architectural-diffusion",
      paper: "https://drive.google.com/file/d/1gkgJtMgf-TnsmlfBQtnrR7EouxR8SxQM/view?usp=sharing",
      year: "2024",
    },
    {
      name: "Local Note Taker",
      description:
        "Privacy-first desktop app with an LLM orchestration layer using Ollama, engineering structured prompt chains and output parsing to generate meeting notes from Whisper-transcribed audio - zero external API dependencies.",
      stack: ["Python", "Ollama", "Whisper"],
      link: "https://github.com/PatrickJaiin/local-notes-taker",
      year: "2026",
    },
    {
      name: "LLM Features for Zulip",
      description:
        "LLM-powered agents for unread message summarization and topic-drift detection in open-source Slack alternative, with RESTful integration and latency-efficient prompt strategies for on-device inference.",
      stack: ["Python", "LLMs", "REST APIs"],
      link: null,
      year: "2026",
    },
    {
      name: "Terminal Portfolio",
      description:
        "A macOS-themed terminal personal website with draggable windows, embedded Spotify and YouTube players, and an interactive command-line interface.",
      stack: ["Next.js", "React", "Tailwind CSS"],
      link: "/terminal",
      year: "2022",
      featured: true,
    },
    {
      name: "Reverse Engineering the YouTube Algorithm",
      description:
        "Built a graph crawler mapping YouTube's recommendation algorithm across 10K+ videos with ForceAtlas2 community detection. Published as 'Parametric Algorithmic Transformer Based Weighted YouTube Video Analysis' - a custom weighted scoring framework with modularity-based classification.",
      stack: ["Python", "Graph Analysis", "Transformers", "Research"],
      link: "/projects/youtube-algorithm",
      paper: "https://drive.google.com/file/d/1SeZ7qM6QHVxB5Ont9-CsWYe0b_WXiWwh/view?usp=sharing",
      researchgate: "https://www.researchgate.net/publication/385962242_Parametric_algorithmic_transformer_based_weighted_YouTube_video_analysis",
      year: "2023",
    },
    {
      name: "Autonomous FPV Drone",
      description:
        "End-to-end autonomous navigation system using ROS with PID controllers, computer vision pipelines, and path planning for real-time beacon identification and obstacle avoidance.",
      stack: ["ROS", "C++", "Computer Vision"],
      link: "/projects/autonomous-drone",
      video: "https://drive.google.com/file/d/1q6t1lj6cP6v9freTHnrVP7j_K1OAIBSC/preview",
      year: "2024",
    },
  ],
  contacts: [
    {
      medium: "Email",
      username: "shivg@andrew.cmu.edu",
      link: "mailto:shivg@andrew.cmu.edu",
    },
    {
      medium: "GitHub",
      username: "PatrickJaiin",
      link: "https://github.com/PatrickJaiin",
    },
    {
      medium: "LinkedIn",
      username: "shivvguptaa",
      link: "https://linkedin.com/in/shivvguptaa",
    },
    {
      medium: "Website",
      username: "shivgupta.in",
      link: "https://shivgupta.in",
    },
  ],
};
