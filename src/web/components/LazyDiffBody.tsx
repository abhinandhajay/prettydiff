import { useCallback, useState } from "react";

const PAINT_MARGIN = "2000px 0px";

interface Props {
    estimatedHeight: number;
    forceMount?: boolean;
    children: React.ReactNode;
}

export function LazyDiffBody({ estimatedHeight, forceMount, children }: Props) {
    const [near, setNear] = useState(false);

    const setRef = useCallback((node: HTMLDivElement | null) => {
        if (!node) return;
        const io = new IntersectionObserver(
            (entries) => {
                for (const e of entries) setNear(e.isIntersecting);
            },
            { rootMargin: PAINT_MARGIN },
        );
        io.observe(node);
        return () => io.disconnect();
    }, []);

    return (
        <div
            ref={setRef}
            style={{
                contentVisibility: forceMount || near ? "visible" : "auto",
                containIntrinsicSize: `auto ${estimatedHeight}px`,
            }}
        >
            {children}
        </div>
    );
}
