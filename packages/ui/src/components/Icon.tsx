interface IconProps {
    svg: string;
    className?: string;
}

export function Icon({ svg, className }: IconProps) {
    return (
        <span
            className={className ? `icon ${className}` : "icon"}
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
}
