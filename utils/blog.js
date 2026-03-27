export const blogPosts = [
  {
    slug: "grey-swan-hackathon-first-red-team",
    title: "My First AI Red Team: Grey Swan Hackathon",
    date: "2026-03-15",
    excerpt:
      "What participating in a Grey Swan AI red teaming hackathon taught me about how language models actually enforce safety.",
    content: `
Grey Swan AI runs the largest AI red teaming network in the world. Their hackathons put anonymized models from companies like OpenAI, Anthropic, and Google DeepMind in front of participants and challenge them to find safety vulnerabilities. Past events have seen thousands of participants generate millions of attack attempts, with findings going directly into model safety cards before public release. When I heard about this one I signed up immediately.

I went in with zero red teaming experience. I'd done some reading online beforehand about how people approach this and the deeper principles behind why models behave the way they do under adversarial pressure. That research shaped how I thought about the problem.

Hackathon rules require exploits to stay private for 30 days so I won't be sharing specifics. But I want to write about the principles that clicked for me and what I took away from my first real exposure to AI safety work.

## What I Learned About How Models Enforce Safety

The biggest shift in my thinking was understanding that LLM safety isn't really a wall. It's a weight system. Every token you send carries a classification weight that the model checks against its safety training. The model is constantly predicting your intent based on the pattern of your conversation, not just the individual words.

There are very few absolute hard stops in any model's safety architecture. The rest is softer, contextual, and responsive to framing. The same word can trigger a refusal or pass cleanly depending on the conversational context that precedes it. The model's trust in your intent shifts dynamically across a conversation and that shift is where the real attack surface lives.

This is fundamentally different from how most people think about prompt injection. It's not about finding magic words. It's about understanding the weight structure and navigating it.

## Why Prompt Sharing is a Dead End

One thing that became obvious during the hackathon is why shared jailbreak prompts stop working so fast. Anything posted publicly gets scraped into training data. The models patch against it. The cycle of someone sharing a working prompt and it dying within days is completely predictable.

The participants who did well weren't using tricks. They were reading the model's responses carefully, understanding what the output signals meant about where the model sat relative to its own thresholds, and adjusting in real time. It's a skill, not a script.

## Building My Own Approach

Based on what I'd read about token weights and contextual trust, I built a prompt from scratch. The idea was simple: instead of trying to brute force past the safety layer with a static injection, design something that works with the model's own weight classification system. If the model determines safety by reading conversational patterns and predicting intent through token weights, then the prompt should shape those patterns rather than fight them.

It worked. I was able to break through the safety constraints on multiple models at the hackathon. I can't go into what the prompt does or how it's structured, but the underlying theory is that a prompt designed around how the model classifies trust will always outperform one designed around how it classifies threat. The model's own prediction system becomes the vector rather than the obstacle.

What surprised me was how reliably it transferred. I'd built it with one model in mind but it worked across what I'm fairly sure were Claude, GPT, and Gemini based on their output patterns (models were anonymized, so this is my best extrapolation from how they write). That transferability is what told me the approach was targeting something structural rather than model specific.

## The Transferability Problem

The thing that concerned me most was how transferable the approaches were across models. These companies build their safety systems independently but the underlying architectures share enough in common that understanding one model's behavior gives you a strong starting point for the others.

Grey Swan's own research backs this up. In their previous hackathons, 22 out of 25 industry models were broken within the first hour. Their Cygnet models using circuit breaker defenses lasted significantly longer, but the pattern is clear: standard alignment training is not enough against someone who understands the structural principles.

## Agent Safety is a Different Problem Entirely

The hackathon also exposed me to something I hadn't thought much about before: agent safety. When models are connected to tool use frameworks and can take actions in the real world, the attack surface changes completely. It's not just about what the model says anymore. It's about what it does.

Grey Swan's recent UK AISI collaboration evaluated 22 models across agentic scenarios with 1.8 million attack attempts. The results showed that even the most robust models had measurable failure rates. And in agent contexts, a failure isn't a bad chatbot response. It's an autonomous system taking actions it shouldn't.

This is the part of AI safety that feels most urgent to me. As agent systems become more common the stakes of these vulnerabilities go up dramatically.

## What I Took Away

This was my entry point into AI safety and a few things became clear.

The surface level understanding of LLM jailbreaking that most people have is barely scratching the real problem. The actual attack surface is structural and conversational. It requires understanding how these systems think, how they classify intent, and how their internal weight systems respond to context over time.

You don't need to be a machine learning researcher to do meaningful work here. Grey Swan's hackathons are open to all skill levels and some of the most effective red teamers come from non-traditional backgrounds. What matters is being able to read the model, think adversarially, and iterate.

I'll be publishing more after the disclosure window closes. It was a fun weekend and I learned a lot. If you work in AI safety or red teaming I'd love to connect.

Note: This post was written with AI assistance, edited by me, and built on a lot of personal context from the hackathon.
    `,
  },
  {
    slug: "zomato-digital-marketing-seo",
    title: "How Zomato Leveraged Digital Marketing and SEO",
    date: "2023-08-08",
    excerpt:
      "A case study on how Zomato evolved from a restaurant menu service to India's dominant food delivery platform through strategic digital marketing.",
    source: "https://medium.com/@shiv_/how-zomato-leveraged-digital-marketing-and-seo-to-become-the-face-of-food-delivery-in-india-90b328213451",
  },
  {
    slug: "demystifying-supercomputing",
    title: "Demystifying Supercomputing",
    date: "2022-12-10",
    excerpt:
      "Whenever you hear about supercomputing, you understand it as a super fancy super-fast computer. Let's dive into what actually goes behind the scenes.",
    source: "https://medium.com/@shiv_/demystifying-supercomputing-12f8047c8b14",
  },
  {
    slug: "google-maps-behind-the-curtains",
    title: "Google Maps: What is the Magic Behind the Curtains",
    date: "2022-04-10",
    excerpt:
      "You enter a starting point and destination and get turn-by-turn navigation. Let's explore how Google actually pulls this off.",
    source: "https://medium.com/@shiv_/google-maps-what-is-the-magic-behind-the-curtains-48c9f88cfd35",
  },
];
