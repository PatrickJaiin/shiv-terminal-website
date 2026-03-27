const COMMANDS = [
    {
      command: "about",
      description: "About Me",
    },
    {
      command: "education",
      description: "My Education",
    },
    {
      command: "skills",
      description: "My Tech Skills",
    },
    {
      command: "projects",
      description: "My Tech Projects",
    
    },
    {
      command: "hobbies",
      description: "My Hobbies",
    },
    {
      command: "contact",
      description: "Contact Me",
    },
    {
      command:
        "clear",
      description: "Clear terminal",
    },
  ];
  
  
  export const CONTENTS = {
    help: () =>
      COMMANDS.map(
        (command) => `<div style="display: flex; justify-content: space-between;">
          <p style="font-size: 15px">${command.command}</p>
          <p>${command.description}</p>
        </div>`
      ).join("") +
      `<br />
        <div class="command">Type one of the above to view. For eg. <span style="color: var(--secondary)">about</span></div>`,
    about: () => `
    MS AI Student @ CMU. Building LLM agents, latent reasoning systems, token-efficient reasoning techniques & scalable backends.
    `,
    education:
      () => `
    <b>Carnegie Mellon University</b> - MS in AI and Innovation (GPA 3.33/4), May 2027<br>
    Coursework: Computer Systems, AI & Future Markets, LLM Applications, Deep Learning, Computer Vision<br><br>
    <b>Bennett University</b> - B.Tech CSE (CGPA 8.75/10), May 2024<br>
    Coursework: Algorithms, AI/ML, Deep Learning, NLP, HPC, OS, Prob & Statistics, Data Structures
      `,
    skills: () => `
    <b>AI/ML:</b> Python, CUDA Python, TensorFlow, PyTorch, Deep Learning, Computer Vision, NLP, Cloud Computing<br>
    <b>Programming:</b> Java, Spring Boot, C, C++, Verilog, ReactJS, Tailwind CSS, Flask, Django, SQL, MongoDB<br>
    <b>Other:</b> RAG, Multi-Agent Systems, Chain-of-Thought, Context Management, RESTful APIs, Microservices, Embedded Systems<br>
    `,
    projects: () => `
    <b>Latent Reasoning Architecture for LLMs</b> (2026)<br>
    Multi-agent cognitive architecture for latent-space idle reasoning via hidden-state recurrence<br><br>
    <b>Local Note Taker</b> (2026)<br>
    Privacy-first desktop app using Ollama + Whisper for meeting notes, zero external APIs<br><br>
    <b>LLM Features for Zulip</b> (2026)<br>
    LLM-powered agents for message summarization & topic-drift detection in open-source Slack alternative<br><br>
    <b>Reverse Engineering the YouTube Algorithm</b> (2023)<br>
    Graph crawler mapping YouTube recommendations across 10K+ videos with ForceAtlas2 community detection<br><br>
    <b>Autonomous FPV Drone</b> (2024)<br>
    End-to-end autonomous navigation with ROS, PID controllers & computer vision<br>
    `,
    contact: () => `
    Shiv Gupta<br>
    <a href="mailto:shivg@andrew.cmu.edu">shivg@andrew.cmu.edu</a><br>
    <a href="https://github.com/PatrickJaiin" target="_blank">github.com/PatrickJaiin</a><br>
    <a href="https://linkedin.com/in/shivvguptaa" target="_blank">linkedin.com/in/shivvguptaa</a><br>
    <a href="https://shivgupta.in" target="_blank">shivgupta.in</a><br>`,
    hobbies: () => `
    Playing Lawn Tennis, Table Tennis, Chess & Football<br>
    Watching TV shows and playing Video Games<br>
    3D printing cool stuff<br>
    Making interesting projects<br>
    `,
    error: (input) =>
      `<div class="help-command">sh: Unknown command: ${input}</div><div class="help-command">See \`help\` for info`,
  };
