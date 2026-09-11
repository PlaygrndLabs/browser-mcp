export {};

const statusElement = document.querySelector<HTMLDivElement>("#status");

void chrome.runtime.sendMessage({ type: "native-status" }).then((result: { connected?: boolean } | undefined) => {
  if (!statusElement) return;
  const connected = result?.connected === true;
  statusElement.classList.toggle("connected", connected);
  const label = statusElement.querySelector("span:last-child");
  if (label) label.textContent = connected ? "Native host connected" : "Native host unavailable";
}).catch(() => {
  const label = statusElement?.querySelector("span:last-child");
  if (label) label.textContent = "Native host unavailable";
});
