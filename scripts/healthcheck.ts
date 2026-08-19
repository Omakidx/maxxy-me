const port = process.env.PORT ?? "3000";
const response = await fetch(`http://127.0.0.1:${port}/health`);
process.exit(response.ok ? 0 : 1);

export {};
