import { Client, isFullPageOrDatabase } from "npm:@notionhq/client";
import { SlackAPI } from "https://deno.land/x/deno_slack_api@2.1.1/mod.ts";

import "https://deno.land/std@0.214.0/dotenv/load.ts";

/** 文字列のリストをSlackのリッチエディタ用のリストに変換する関数 */
function strings2listElements(list: string[]) {
  const listElements = list.map((task) => {
    return {
      type: "rich_text_section",
      elements: [
        { type: "text", text: task },
      ],
    };
  });
  return listElements;
}

async function sendToSlack() {
  const slack = SlackAPI(Deno.env.get("SLACK_API_TOKEN")!);
  const notion = new Client({
    auth: Deno.env.get("NOTION_API_KEY"),
  });

  // NotionのTodoデータベースからタスクを取得
  const databaseRes = await notion.databases.query({
    database_id: Deno.env.get("NOTION_DATABASE_ID")!,
    filter: {
      or: [
        {
          property: "ステータス",
          status: { equals: "未着手" },
        },
        {
          property: "ステータス",
          status: { equals: "対応中" },
        },
      ],
    },
  });

  // タスクのリストを作成
  const notStartedList: string[] = [];
  const inProgressList: string[] = [];

  databaseRes.results.forEach((result) => {
    if (!isFullPageOrDatabase(result)) return;

    const nameEl = result.properties.Name;
    const statusEl = result.properties.ステータス;

    if (nameEl.type !== "title") return;
    if (statusEl.type !== "status") return;

    if (!Array.isArray(nameEl.title)) return;

    if (statusEl.status === null || !("name" in statusEl.status)) return;
    const status = statusEl.status.name;

    if (nameEl.title.length === 0) return;
    const text = nameEl.title[0].plain_text;

    if (status === "未着手") {
      notStartedList.push(text);
    } else if (status === "対応中") {
      inProgressList.push(text);
    }
  });

  // console.log(notStartedList);
  // console.log(inProgressList);

  const notStartedListblock = {
    type: "rich_text",
    elements: [
      {
        type: "rich_text_section",
        elements: [{ type: "text", text: "未完了", style: { bold: true } }],
      },
      {
        type: "rich_text_list",
        style: "bullet",
        elements: strings2listElements(notStartedList),
      },
    ],
  };
  const inProgressListblock = {
    type: "rich_text",
    elements: [
      {
        type: "rich_text_section",
        elements: [{ type: "text", text: "対応中", style: { bold: true } }],
      },
      {
        type: "rich_text_list",
        style: "bullet",
        elements: strings2listElements(inProgressList),
      },
    ],
  };

  const blocks = [];
  if (inProgressList.length > 0) blocks.push(inProgressListblock);
  if (notStartedList.length > 0) blocks.push(notStartedListblock);

  const slackRes = await slack.chat.postMessage({
    blocks,
    channel: "task",
  });

  console.debug(slackRes);
}

Deno.cron(
  "Send Todo to slack",
  { minute: { every: 23 } },
  { backoffSchedule: [1000, 5000, 10000] },
  sendToSlack,
);

// sendToSlack();
