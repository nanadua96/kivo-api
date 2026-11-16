import mongoose from 'mongoose';

export const conversations = [
  {
    title: 'Intro to React.js',
    createdAt: '2026-11-13T07:16:18.255Z',
    updatedAt: '2026-11-13T07:16:18.255Z',
  },
];

const messages = [
  {
    role: 'user',
    content: 'What is React.js?',
    model: 'qwen/qwen3.8-27b',
    sequence: 1,
    status: 'complete',
    createdAt: '2026-11-13T07:16:18.265Z',
    updatedAt: '2026-11-13T07:16:18.265Z',
  },
  {
    role: 'assistant',
    content:
      "**React.js** (officially called **React**) is a popular **JavaScript library** for building user interfaces, particularly single-page applications (SPAs). It was developed and initially released by **Facebook** (now Meta) and is currently maintained by Facebook and a community of individuals and companies.\n\n### Key Characteristics:\n\n1. **Component-Based Architecture**:\n   - React encourages building applications out of small, reusable, self-contained components.\n   - Each component manages its own local state and renders HTML from it.\n\n2. **Virtual DOM (Document Object Model)**:\n   - Instead of manipulating the real DOM directly (which is slow), React uses a **Virtual DOM** — a lightweight in-memory representation of the UI.\n   - When a component’s state changes, React compares the new Virtual DOM with the previous one (a process called **reconciliation**) and only updates the parts of the real DOM that have changed. This improves performance.\n\n3. **Declarative Syntax**:\n   - React allows you to describe *what* the UI should look like in various states, rather than manually manipulating the DOM.\n   - This makes code easier to understand, maintain, and test.\n\n4. **JSX (JavaScript XML)**:\n   - React uses **JSX**, a syntax extension that lets you write HTML-like structures directly in JavaScript code.\n   - Example:\n     ```jsx\n     function Welcome() {\n       return <h1>Hello, world!</h1>;\n     }\n     ```\n   - JSX is transformed into standard JavaScript calls to `React.createElement()`.\n\n5. **One-Way Data Flow**:\n   - Data typically flows downward from parent components to child components via **props** (properties). This makes data flow predictable and easier to debug.\n\n6. **Ecosystem and Tooling**:\n   - **React Native**: Uses React concepts to build native mobile apps for iOS and Android.\n   - **Redux, Context API, React Query**: Popular libraries and patterns for managing application state.\n   - **Create React App, Next.js, Gatsby**: Popular frameworks and tools for scaffolding and building React applications.\n\n### Why is React Popular?\n\n- **High Performance**: Efficient rendering through the Virtual DOM.\n- **Flexibility**: Works with complex UIs and can be used alongside other JavaScript libraries.\n- **Large Community**: Extensive documentation, third-party libraries, and active community support.\n- **Industry Adoption**: Used by major companies like Facebook, Instagram, Netflix, Airbnb, Uber, and many startups.\n\n### Example Usage:\n\n```jsx\nimport React, { useState } from 'react';\n\nfunction Counter() {\n  const [count, setCount] = useState(0);\n\n  return (\n    <div>\n      <p>You clicked {count} times</p>\n      <button onClick={() => setCount(count + 1)}>\n        Click me\n      </button>\n    </div>\n  );\n}\n```\n\nIn summary, **React** is a powerful, flexible, and widely-used library for constructing dynamic, interactive web (and mobile) user interfaces with a focus on performance, developer experience, and maintainability.",
    model: 'qwen/qwen3.8-27b',
    sequence: 2,
    status: 'complete',
    createdAt: '2026-11-13T07:16:18.265Z',
    updatedAt: '2026-11-14T10:21:35.770Z',
    rating: 'up',
  },
];

export function loadSample(userId) {
  const conversationId = new mongoose.Types.ObjectId();

  const mappedConvo = conversations.map((i) => {
    return { ...i, user: userId, _id: conversationId };
  });

  const mappedMessages = messages.map((i) => {
    return { ...i, user: userId, conversation: conversationId };
  });

  return { conversations: mappedConvo, messages: mappedMessages };
}
