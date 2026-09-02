import alibabacloud from "@lobehub/icons-static-svg/icons/alibabacloud.svg" with { type: "text" };
import anthropic from "@lobehub/icons-static-svg/icons/anthropic.svg" with { type: "text" };
import antigravity from "@lobehub/icons-static-svg/icons/antigravity.svg" with { type: "text" };
import baiducloud from "@lobehub/icons-static-svg/icons/baiducloud.svg" with { type: "text" };
import baseten from "@lobehub/icons-static-svg/icons/baseten.svg" with { type: "text" };
import cerebras from "@lobehub/icons-static-svg/icons/cerebras.svg" with { type: "text" };
import cloudflare from "@lobehub/icons-static-svg/icons/cloudflare.svg" with { type: "text" };
import cursor from "@lobehub/icons-static-svg/icons/cursor.svg" with { type: "text" };
import deepinfra from "@lobehub/icons-static-svg/icons/deepinfra.svg" with { type: "text" };
import deepseek from "@lobehub/icons-static-svg/icons/deepseek.svg" with { type: "text" };
import devin from "@lobehub/icons-static-svg/icons/devin.svg" with { type: "text" };
import exa from "@lobehub/icons-static-svg/icons/exa.svg" with { type: "text" };
import fireworks from "@lobehub/icons-static-svg/icons/fireworks.svg" with { type: "text" };
import gemini from "@lobehub/icons-static-svg/icons/gemini.svg" with { type: "text" };
import githubcopilot from "@lobehub/icons-static-svg/icons/githubcopilot.svg" with { type: "text" };
import grok from "@lobehub/icons-static-svg/icons/grok.svg" with { type: "text" };
import huggingface from "@lobehub/icons-static-svg/icons/huggingface.svg" with { type: "text" };
import { Icon } from "./Icon";
import kagi from "@lobehub/icons-static-svg/icons/kagi.svg" with { type: "text" };
import kimi from "@lobehub/icons-static-svg/icons/kimi.svg" with { type: "text" };
import lmstudio from "@lobehub/icons-static-svg/icons/lmstudio.svg" with { type: "text" };
import meta from "@lobehub/icons-static-svg/icons/meta.svg" with { type: "text" };
import minimax from "@lobehub/icons-static-svg/icons/minimax.svg" with { type: "text" };
import moonshot from "@lobehub/icons-static-svg/icons/moonshot.svg" with { type: "text" };
import novita from "@lobehub/icons-static-svg/icons/novita.svg" with { type: "text" };
import nvidia from "@lobehub/icons-static-svg/icons/nvidia.svg" with { type: "text" };
import ollama from "@lobehub/icons-static-svg/icons/ollama.svg" with { type: "text" };
import openai from "@lobehub/icons-static-svg/icons/openai.svg" with { type: "text" };
import opencode from "@lobehub/icons-static-svg/icons/opencode.svg" with { type: "text" };
import openrouter from "@lobehub/icons-static-svg/icons/openrouter.svg" with { type: "text" };
import perplexity from "@lobehub/icons-static-svg/icons/perplexity.svg" with { type: "text" };
import qwen from "@lobehub/icons-static-svg/icons/qwen.svg" with { type: "text" };
import tavily from "@lobehub/icons-static-svg/icons/tavily.svg" with { type: "text" };
import together from "@lobehub/icons-static-svg/icons/together.svg" with { type: "text" };
import venice from "@lobehub/icons-static-svg/icons/venice.svg" with { type: "text" };
import vercel from "@lobehub/icons-static-svg/icons/vercel.svg" with { type: "text" };
import vllm from "@lobehub/icons-static-svg/icons/vllm.svg" with { type: "text" };
import xai from "@lobehub/icons-static-svg/icons/xai.svg" with { type: "text" };
import xiaomimimo from "@lobehub/icons-static-svg/icons/xiaomimimo.svg" with { type: "text" };
import zai from "@lobehub/icons-static-svg/icons/zai.svg" with { type: "text" };
import zenmux from "@lobehub/icons-static-svg/icons/zenmux.svg" with { type: "text" };
import zhipu from "@lobehub/icons-static-svg/icons/zhipu.svg" with { type: "text" };

/*
 * Oh My Pi's OAuth provider ids -> the closest brand mark in
 * @lobehub/icons-static-svg (a curated AI/LLM provider icon set — plain
 * simple-icons has no OpenAI mark and misses most inference vendors).
 * Providers with no dedicated icon fall back to a plain initial.
 */
const ICONS: Record<string, string> = {
    "alibaba-coding-plan": alibabacloud,
    "alibaba-token-plan": qwen,
    anthropic,
    "cloudflare-ai-gateway": cloudflare,
    cerebras,
    baseten,
    cursor,
    deepinfra,
    deepseek,
    devin,
    exa,
    firepass: fireworks,
    fireworks,
    "github-copilot": githubcopilot,
    "google-antigravity": antigravity,
    "google-gemini-cli": gemini,
    huggingface,
    kagi,
    "kimi-code": kimi,
    "lm-studio": lmstudio,
    meta,
    "minimax-code": minimax,
    "minimax-code-cn": minimax,
    moonshot,
    novita,
    nvidia,
    ollama,
    "ollama-cloud": ollama,
    "opencode-go": opencode,
    "opencode-zen": opencode,
    "openai-codex": openai,
    "openai-codex-device": openai,
    openrouter,
    perplexity,
    qianfan: baiducloud,
    "qwen-portal": qwen,
    tavily,
    together,
    "vercel-ai-gateway": vercel,
    venice,
    vllm,
    xai,
    "xai-oauth": grok,
    xiaomi: xiaomimimo,
    "xiaomi-token-plan-ams": xiaomimimo,
    "xiaomi-token-plan-cn": xiaomimimo,
    "xiaomi-token-plan-sgp": xiaomimimo,
    zai,
    "zai-coding-plan": zai,
    zenmux,
    "zhipu-coding-plan": zhipu,
};

interface ProviderIconProps {
    providerId: string;
}

export function ProviderIcon({ providerId }: ProviderIconProps) {
    const svg = ICONS[providerId];
    if (!svg) {
        return (
            <span className="provider-icon provider-icon--fallback" aria-hidden="true">
                {providerId.slice(0, 1).toUpperCase()}
            </span>
        );
    }
    return <Icon svg={svg} className="provider-icon" />;
}
