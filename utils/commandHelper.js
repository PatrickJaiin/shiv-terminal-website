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
      command: "contact",
      description: "Contact Me",
    },
    {
      command:
        "clear",
      description: "Clear terminal",
    },
  ];
  
  const getProjects = async () => {
    const projects = await (await fetch("/api/projects")).json();
    const projectHTML =
      `<h3>My Projects (You can scroll)</h3>` +
      projects
        .map(
          (project) => `<div class="command">
          <a href="${project.link}" target="_blank"><b class="command">${
            project.name
          }</b></a> - <b>${project.stack.join(", ")}</b>
          <p class="meaning">${project.description}</p>
        </div>`
        )
        .join("");
    return projectHTML;
  };
  
  const getContacts = async () => {
    const contactMediums = await (await fetch("/api/contacts")).json();
    return contactMediums
      .map(
        (contact) => `<div style="display: flex; justify-content: space-between;">
        <p style="font-size: 15px">${contact.medium}</p>
        <a class="meaning" href="${contact.link}" target="_blank">${contact.username}</a>
      </div>`
      )
      .join("");
  };
  
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
    Robotics<br>
    Python<br>
    C++<br>
    HTML, CSS, PHP<br>
    React, NextJs, Tailwind CSS<br>
    `,
    projects: getProjects,
    contact: getContacts,
    error: (input) =>
      `<div class="help-command">sh: Unknown command: ${input}</div><div class="help-command">See \`help\` for info`,
  };
