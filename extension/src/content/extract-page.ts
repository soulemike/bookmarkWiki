export interface ExtractedPageContext {
  title: string;
  url: string;
  metadata: Record<string, string>;
  visibleText: string;
}

function extractMetadata(): Record<string, string> {
  const metadata: Record<string, string> = {};
  document.querySelectorAll<HTMLMetaElement>("meta[name], meta[property]").forEach((meta) => {
    const key = meta.name || meta.getAttribute("property");
    if (key && meta.content) metadata[key] = meta.content;
  });
  return metadata;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "extract-page-context") return false;
  const context: ExtractedPageContext = {
    title: document.title,
    url: location.href,
    metadata: extractMetadata(),
    visibleText: document.body?.innerText?.slice(0, 12_000) ?? ""
  };
  sendResponse(context);
  return true;
});
