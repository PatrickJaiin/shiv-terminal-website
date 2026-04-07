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
      name: "AI Trading Tool",
      description:
        "Full AI-native trading pipeline for prediction platforms like Kalshi and Polymarket. Currently exploring strategies including arbitrage and others - strategies are kept private as the project is proprietary.",
      stack: ["Python", "httpx", "GraphQL", "REST API", "Arbitrage"],
      link: "/projects/trading-bot",
      year: "2026",
      locked: true,
      type: "tool",
    },
    {
      name: "People Grouper",
      description:
        "Interactive tool for random person picking, team generation, and one-to-many people organization with smart diversity-maximizing shuffles, lock-in preferences, and password-protected saveable boards.",
      stack: ["Next.js", "React", "Tailwind CSS"],
      link: "/projects/people-grouper",
      year: "2026",
      type: "tool",
    },
    {
      name: "AI Poker Bot – Jump Trading Poker Competition",
      description:
        "Competitive AI poker agent for the Jump Trading x CMU AI Poker Tournament 2026. Features exact equity computation, Bayesian opponent modeling, Monte Carlo sampling, and position-aware strategies over a modified 27-card deck.",
      stack: ["Python", "Game Theory", "Bayesian Inference", "Monte Carlo"],
      link: "/projects/poker-bot",
      year: "2026",
      type: "tool",
    },
    {
      name: "Closed-Thought LLM",
      description:
        "Training-free latent reasoning for frozen LLMs. +13pp on GSM8K via KV-cache recurrence, split-layer generation, and answer-mass gating — zero training, zero fine-tuning.",
      stack: ["Python", "PyTorch", "LLMs", "CUDA"],
      link: "/projects/latent-reasoning",
      year: "2026",
      type: "report",
    },
    {
      name: "Who is Harry Potter",
      description:
        "Replication and extension of the 'Who is Harry Potter?' unlearning experiment - selectively erasing specific knowledge from LLMs while preserving general capabilities.",
      stack: ["Python", "PyTorch", "LLMs"],
      link: "https://github.com/PatrickJaiin/who-is-harry-potter",
      year: "2026",
      type: "ext-report",
    },
    {
      name: "Diffusion Based Generative Modelling for Architectural Visualization",
      description:
        "Developed Diffusion and ControlNet based Interior & Exterior design generation models at the National University of Singapore. Research on applying generative AI techniques for architectural visualization and design under the guidance of Dr Tan Wee Kek.",
      stack: ["Python", "Diffusion Models", "ControlNet", "Computer Vision"],
      link: "/projects/architectural-diffusion",
      paper: "https://drive.google.com/file/d/1gkgJtMgf-TnsmlfBQtnrR7EouxR8SxQM/view?usp=sharing",
      year: "2024",
      type: "paper",
    },
    {
      name: "Local Note Taker",
      description:
        "Privacy-first desktop app with an LLM orchestration layer using Ollama, engineering structured prompt chains and output parsing to generate meeting notes from Whisper-transcribed audio - zero external API dependencies.",
      stack: ["Python", "Ollama", "Whisper"],
      link: "https://github.com/PatrickJaiin/local-notes-taker",
      year: "2026",
      type: "ext-app",
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
      type: "interactive",
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
      type: "tool",

    },
    {
      name: "EV Swapping Solution",
      description:
        "Developed the Frontend and Backend for an app where users can find the nearest EV swap/charging station and book a swap while on route. Developed AI analysis for optimal map positions of EV Swap Stations and a mathematical algorithm for pricing to solve battery swap mismatch through an AI model trained for battery degradation prediction.",
      stack: ["AI/ML", "Full Stack", "Maps API"],
      link: "https://docs.google.com/presentation/d/1csFBi9NKNH_Dcqv7blx_Cv5EriCX948fu5dgH2iBWWs/edit?usp=sharing",
      year: "2022",
      type: "ext-report",
    },
    {
      name: "Fire and Smoke Detection",
      description:
        "Architectured and designed code for models like CNNs, and developed models using skeleton codes of ResNet152 and VGG19 for detecting fire and smoke in visual input. Collected data, preprocessed it, augmented it to prevent skewness and used this custom dataset for training. Hyperparameter tuned the model based on results and deployed it using Streamlit.",
      stack: ["Python", "CNNs", "ResNet152", "VGG19", "Streamlit"],
      link: "https://docs.google.com/presentation/d/1S0-LzMXlxHPZLGEfMLYnLyMC7e6Jzkn0_DqLKtq-x3g/edit?usp=sharing",
      year: "2023",
      type: "ext-report",
    },
    {
      name: "Autonomous FPV Drone",
      description:
        "End-to-end autonomous navigation system using ROS with PID controllers, computer vision pipelines, and path planning for real-time beacon identification and obstacle avoidance.",
      stack: ["ROS", "C++", "Computer Vision"],
      link: "/projects/autonomous-drone",
      video: "https://drive.google.com/file/d/1q6t1lj6cP6v9freTHnrVP7j_K1OAIBSC/preview",
      year: "2024",
      type: "demo",
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
