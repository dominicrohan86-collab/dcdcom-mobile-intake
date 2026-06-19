import { metric, queueCard, shell } from "../components.js";

export function todayScreen({ state, inquiries }) {
  const cards = inquiries.slice(0, 4).map((item, index) => queueCard(item, index)).join("");
  return shell(`
    <section class="hero"><h2>Today</h2></section>
    <section class="metrics-grid">
      ${metric("bag", "12", "New", "blue")}
      ${metric("help", "5", "Needs Info", "amber")}
      ${metric("calendar", "3", "Site Visits", "green")}
      ${metric("dollar", "$184K", "Est. Value", "green")}
    </section>
    <section class="section-head"><h3>Priority Queue</h3><button data-screen="pipeline">View All</button></section>
    <div class="queue-list">${cards}</div>
  `, state);
}
