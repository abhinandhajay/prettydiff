interface Props {
    estimatedHeight: number;
    children: React.ReactNode;
}

export function LazyDiffBody({ estimatedHeight, children }: Props) {
    return (
        <div
            style={{
                contentVisibility: "auto",
                containIntrinsicSize: `auto ${estimatedHeight}px`,
            }}
        >
            {children}
        </div>
    );
}
