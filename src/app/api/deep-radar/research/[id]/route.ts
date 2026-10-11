import { acceptedMessageImages } from "@/features/deep-radar/lib/research-images";
import { NextResponse } from "next/server";
import { deleteSession, getSessionBundle, listSessions } from "@/features/deep-radar/lib/db";
import {
  applyEvent,
  drain,
  isBusy,
  requestAbort,
  rewindAndResume,
} from "@/features/deep-radar/lib/research-orchestrator";
import { rewindActionOptions } from "@/features/deep-radar/lib/research-rewind";
import { researchStore, wireRuntime } from "@/features/deep-radar/lib/runtime";
import { toggleFavorite } from "@/features/deep-radar/lib/service";
import type { ResearchEvent } from "@/features/deep-radar/lib/research-types";

export const dynamic = "force-dynamic";

type Body = {
  action?: string;
  text?: string;
  feedback?: string;
  messageId?: string;
  images?: unknown;
  favorited?: boolean;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  wireRuntime();
  const { id } = await context.params;
  const bundle = getSessionBundle(id);
  if (!bundle) {
    return NextResponse.json({ error: "研究会话不存在" }, { status: 404 });
  }
  if (bundle.session.state.pendingCommands.length > 0 && !isBusy(id)) {
    void drain(researchStore(), id);
  }
  return NextResponse.json({
    ...bundle,
    busy: isBusy(id) || bundle.session.state.pendingCommands.length > 0,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  wireRuntime();
  const { id } = await context.params;
  const store = researchStore();
  if (!getSessionBundle(id)) {
    return NextResponse.json({ error: "研究会话不存在" }, { status: 404 });
  }

  const body = (await request.json()) as Body;
  try {
    if (body.action === "favorite") {
      const snap = toggleFavorite(id, body.favorited);
      const next = getSessionBundle(id);
      return NextResponse.json({
        ...next,
        favorited: snap?.favorited ?? false,
        busy: isBusy(id) || Boolean(next?.session.state.pendingCommands.length),
      });
    }
    if (body.action === "rewind" || body.action === "retry") {
      if (!body.messageId?.trim()) throw new Error("缺少消息");
      const target = getSessionBundle(id)?.messages.find((m) => m.id === body.messageId);
      if (!target) throw new Error("消息不存在");
      if (body.action === "retry" && target.kind === "status") {
        throw new Error("状态消息不能重试");
      }
      await rewindAndResume(
        store,
        id,
        body.messageId,
        rewindActionOptions(
          body.action === "retry" ? "retry" : "rewind",
          target,
        ),
      );
    } else {
      const event = eventFromBody(body);
      if (event.type === "STOP") requestAbort(id);
      applyEvent(store, id, event);
      if (event.type !== "STOP") void drain(store, id);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "请求失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const next = getSessionBundle(id);
  return NextResponse.json({
    ...next,
    busy: isBusy(id) || Boolean(next?.session.state.pendingCommands.length),
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  wireRuntime();
  const { id } = await context.params;
  if (!getSessionBundle(id)) {
    return NextResponse.json({ error: "研究会话不存在" }, { status: 404 });
  }
  requestAbort(id);
  if (!deleteSession(id)) {
    return NextResponse.json({ error: "研究会话不存在" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    nextId: listSessions()[0]?.id ?? null,
  });
}

function eventFromBody(body: Body): ResearchEvent {
  switch (body.action) {
    case "message": {
      const images = acceptedMessageImages(body.images);
      if (!body.text?.trim() && !images.length) throw new Error("消息不能为空");
      return { type: "USER_MESSAGE", text: body.text ?? "", images };
    }
    case "approve":
      return { type: "APPROVE_OUTLINE" };
    case "revise":
      if (!body.feedback?.trim()) throw new Error("请填写修改意见");
      return { type: "REVISE_OUTLINE", feedback: body.feedback };
    case "stop":
      return { type: "STOP" };
    case "continue":
      return { type: "CONTINUE" };
    case "report":
      return { type: "GENERATE_REPORT" };
    default:
      throw new Error("未知操作");
  }
}
