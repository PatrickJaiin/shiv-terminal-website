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
    Hi, I am Shiv
    `,
    education:
      () => `
    Undergrad: Bennett University (Computer Science Engineering with Specialization in Cyber Security)<br>
    Middle and High School: Modern School Barakhamba Road (PCMCS)<br>
    Junior School: The Indian School
      `,
    skills: () => `
    AI/ML, Deep Learning<br>
    Robotics<br>
    Python, C++<br>
    HTML, CSS, PHP, SEO<br>
    React, NextJs, Tailwind CSS, Flask<br>
    `,
    projects: ()=>`
    see list in resume or blogs about some of them in the blogs section.
    `,
    contact: () => `
    Shiv Gupta<br>
    +91 9810081820<br>
    shivg03@gmail.com<br>`,
    hobbies: () => `
    Playing Lawn Tennis, Table Tennis, Chess & Football<br>
    Watching TV shows and playing Video Games<br>
    3D printing cool stuff<br>
    Making interesting projects<br>
    `,
    error: (input) =>
      `<div class="help-command">sh: Unknown command: ${input}</div><div class="help-command">See \`help\` for info`,
  };
