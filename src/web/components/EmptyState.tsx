interface Props {
    title: string;
    message?: string;
}

export function EmptyState({ title, message }: Props) {
    return (
        <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-center">
            <div className="text-lg font-semibold">{title}</div>
            {message ? (
                <div className="text-muted-foreground max-w-md text-sm">{message}</div>
            ) : null}
        </div>
    );
}
