type Page = import("playwright").Page;

interface ScrapeResult {
  html: string;
  markdown: string;
  images: { name: string; data: Buffer; mimeType: string }[];
  metadata: { title: string; author?: string; date?: string };
}

export async function scrapeWebpage(url: string): Promise<ScrapeResult> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    if (url.includes("mp.weixin.qq.com")) {
      await handleWeChatImages(page);
    }

    await autoScroll(page);

    const metadata = await extractMetadata(page, url);
    const { html, markdown, imageUrls } = await extractContent(page, url);
    const images = await downloadImages(imageUrls, page);

    return { html, markdown, images, metadata };
  } finally {
    await browser.close();
  }
}

async function handleWeChatImages(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll("img[data-src]").forEach((img) => {
      const dataSrc = img.getAttribute("data-src");
      if (dataSrc) {
        img.setAttribute("src", dataSrc);
      }
    });
  });
  await page.waitForTimeout(2000);
}

async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(timer);
        resolve();
      }, 10000);
    });
  });
}

async function extractMetadata(page: Page, url: string): Promise<ScrapeResult["metadata"]> {
  return page.evaluate((pageUrl) => {
    const title =
      document.querySelector("h1")?.textContent?.trim() ||
      document.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
      document.title ||
      "Untitled";

    let author: string | undefined;
    if (pageUrl.includes("mp.weixin.qq.com")) {
      author =
        document.querySelector("#js_name")?.textContent?.trim() ||
        document.querySelector(".rich_media_meta_nickname")?.textContent?.trim();
    } else {
      author =
        document.querySelector('meta[name="author"]')?.getAttribute("content") ||
        document.querySelector('[rel="author"]')?.textContent?.trim() ||
        undefined;
    }

    const date =
      document.querySelector('meta[property="article:published_time"]')?.getAttribute("content") ||
      document.querySelector("time")?.getAttribute("datetime") ||
      undefined;

    return { title, author, date: date || undefined };
  }, url);
}

async function extractContent(
  page: Page,
  url: string,
): Promise<{ html: string; markdown: string; imageUrls: string[] }> {
  return page.evaluate((pageUrl) => {
    let container: Element | null = null;

    if (pageUrl.includes("mp.weixin.qq.com")) {
      container = document.querySelector("#js_content");
    } else {
      container =
        document.querySelector("article") ||
        document.querySelector('[role="main"]') ||
        document.querySelector(".post-content") ||
        document.querySelector(".entry-content") ||
        document.querySelector(".article-content") ||
        document.querySelector("main");
    }

    if (!container) {
      container = document.body;
    }

    const imageUrls: string[] = [];
    let imgIndex = 0;

    function nodeToMarkdown(node: Node): string {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent?.trim() || "";
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return "";

      const el = node as Element;
      const tag = el.tagName.toLowerCase();

      if (["script", "style", "nav", "footer", "aside", "iframe"].includes(tag)) {
        return "";
      }

      if (
        el.id === "js_pc_qr_code" ||
        el.classList.contains("qr_code_pc") ||
        el.classList.contains("rich_media_tool")
      ) {
        return "";
      }

      const children = Array.from(node.childNodes).map(nodeToMarkdown).join("");

      switch (tag) {
        case "h1":
          return `\n# ${children}\n`;
        case "h2":
          return `\n## ${children}\n`;
        case "h3":
          return `\n### ${children}\n`;
        case "h4":
          return `\n#### ${children}\n`;
        case "h5":
          return `\n##### ${children}\n`;
        case "h6":
          return `\n###### ${children}\n`;
        case "p":
          return `\n${children}\n`;
        case "br":
          return "\n";
        case "strong":
        case "b":
          return `**${children}**`;
        case "em":
        case "i":
          return `*${children}*`;
        case "code":
          return `\`${children}\``;
        case "pre":
          return `\n\`\`\`\n${el.textContent}\n\`\`\`\n`;
        case "a": {
          const href = el.getAttribute("href");
          return href ? `[${children}](${href})` : children;
        }
        case "img": {
          const src = el.getAttribute("data-src") || el.getAttribute("src") || "";
          if (src && !src.startsWith("data:")) {
            const name = `image_${imgIndex++}`;
            imageUrls.push(src);
            return `\n![${el.getAttribute("alt") || name}](${name})\n`;
          }
          return "";
        }
        case "ul":
          return `\n${Array.from(el.children)
            .map((li) => `- ${nodeToMarkdown(li)}`)
            .join("\n")}\n`;
        case "ol":
          return `\n${Array.from(el.children)
            .map((li, i) => `${i + 1}. ${nodeToMarkdown(li)}`)
            .join("\n")}\n`;
        case "blockquote":
          return `\n> ${children}\n`;
        case "table":
          return convertTable(el);
        case "div":
        case "section":
        case "span":
        case "li":
          return children;
        default:
          return children;
      }
    }

    function convertTable(table: Element): string {
      const rows = Array.from(table.querySelectorAll("tr"));
      if (rows.length === 0) return "";

      const mdRows = rows.map((row) =>
        Array.from(row.querySelectorAll("th, td"))
          .map((cell) => cell.textContent?.trim() || "")
          .join(" | "),
      );

      if (mdRows.length >= 1) {
        const header = mdRows[0];
        const colCount = header.split(" | ").length;
        const separator = Array(colCount).fill("---").join(" | ");
        return `\n| ${header} |\n| ${separator} |\n${mdRows
          .slice(1)
          .map((r) => `| ${r} |`)
          .join("\n")}\n`;
      }
      return "";
    }

    const markdown = nodeToMarkdown(container!)
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Build HTML version with img srcs rewritten to match the markdown placeholder scheme.
    // Each img gets src="image_N" so it can be mapped the same way as markdown refs.
    const htmlRoot = container!.cloneNode(true) as Element;
    let htmlImgIndex = 0;
    // Walk in same document order as nodeToMarkdown to keep indices aligned
    const imgs = htmlRoot.querySelectorAll("img");
    imgs.forEach((img) => {
      const src = img.getAttribute("data-src") || img.getAttribute("src") || "";
      if (src && !src.startsWith("data:")) {
        img.setAttribute("src", `image_${htmlImgIndex++}`);
        img.removeAttribute("data-src");
      }
    });
    // Strip scripts/styles/noise from the HTML too
    htmlRoot
      .querySelectorAll(
        "script, style, nav, footer, aside, iframe, #js_pc_qr_code, .qr_code_pc, .rich_media_tool",
      )
      .forEach((el) => el.remove());
    const html = htmlRoot.outerHTML;

    return { html, markdown, imageUrls };
  }, url);
}

async function downloadImages(imageUrls: string[], page: Page): Promise<ScrapeResult["images"]> {
  const images: ScrapeResult["images"] = [];

  for (let i = 0; i < imageUrls.length; i++) {
    try {
      const url = imageUrls[i];
      const response = await page.context().request.get(url);
      if (response.ok()) {
        const data = await response.body();
        const contentType = response.headers()["content-type"] || "image/png";
        images.push({
          // Keep name aligned with markdown/HTML placeholder `image_N` (no extension)
          // so storeImagesAndRewriteMarkdown can match references correctly.
          name: `image_${i}`,
          data: Buffer.from(data),
          mimeType: contentType.split(";")[0],
        });
      }
    } catch {
      continue;
    }
  }

  return images;
}
