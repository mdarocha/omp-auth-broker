interface StatusBadgeProps {
    kind: string;
    label: string;
    explanation: string;
}

export function StatusBadge({ kind, label, explanation }: StatusBadgeProps) {
    return (
        <button className="status-badge" type="button">
            <span className={`status status--${kind}`}>{label}</span>
            <span className="status-badge__tooltip" role="tooltip">
                {explanation}
            </span>
        </button>
    );
}
