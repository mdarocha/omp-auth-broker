import {
    siAlibabacloud,
    siAnthropic,
    siDeepseek,
    siGithubcopilot,
    siGoogle,
    siGooglecloud,
    siGooglegemini,
    siMistralai,
    siPerplexity,
    siQwen,
    siX,
    siZdotai,
} from "simple-icons";
import type { SimpleIcon } from "simple-icons";

/*
 * Oh My Pi's OAuth provider ids -> the closest brand icon we have available.
 * Simple-icons has no standalone "OpenAI" mark, so providers without a
 * dedicated icon (e.g. the OpenAI-family ids) fall back to a plain initial.
 */
const ICONS: Record<string, SimpleIcon> = {
    anthropic: siAnthropic,
    deepseek: siDeepseek,
    "github-copilot": siGithubcopilot,
    google: siGoogle,
    "google-antigravity": siGoogle,
    "google-gemini-cli": siGooglegemini,
    "google-vertex": siGooglecloud,
    mistral: siMistralai,
    perplexity: siPerplexity,
    "qwen-portal": siQwen,
    xai: siX,
    "xai-oauth": siX,
    zai: siZdotai,
    "zai-coding-plan": siZdotai,
    "alibaba-coding-plan": siAlibabacloud,
};

interface ProviderIconProps {
    providerId: string;
}

export function ProviderIcon({ providerId }: ProviderIconProps) {
    const icon = ICONS[providerId];
    if (!icon) {
        return (
            <span className="provider-icon provider-icon--fallback" aria-hidden="true">
                {providerId.slice(0, 1).toUpperCase()}
            </span>
        );
    }
    return (
        <svg className="provider-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="currentColor" d={icon.path} />
        </svg>
    );
}
