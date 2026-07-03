import { useEffect, useRef, useState } from "react";

interface Props {
    estimatedHeight: number;
    eager?: boolean;
    placeholder?: React.ReactNode;
    children: React.ReactNode;
    onRender: () => void;
}

const PRELOAD_MARGIN_PX = 6000;

export function LazyDiffBody({
    estimatedHeight,
    eager = false,
    placeholder = null,
    children,
    onRender,
}: Props) {
    const ref = useRef<HTMLDivElement | null>(null);
    const [shouldRender, setShouldRender] = useState(eager);
    const [isSettled, setIsSettled] = useState(false);

    useEffect(() => {
        if (eager) setShouldRender(true);
    }, [eager]);

    useEffect(() => {
        if (shouldRender) {
            setIsSettled(false);
            const renderId = window.setTimeout(() => {
                onRender();
            }, 260);
            const settleId = window.setTimeout(() => {
                setIsSettled(true);
            }, 360);
            return () => {
                window.clearTimeout(renderId);
                window.clearTimeout(settleId);
            };
        }
    }, [onRender, shouldRender]);

    useEffect(() => {
        if (shouldRender) return;
        const el = ref.current;
        if (!el) return;
        if (typeof IntersectionObserver === "undefined") {
            setShouldRender(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                setShouldRender(true);
                observer.disconnect();
            },
            { rootMargin: `${PRELOAD_MARGIN_PX}px 0px` },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [shouldRender]);

    return (
        <div ref={ref} style={{ minHeight: isSettled ? undefined : `${estimatedHeight}px` }}>
            {shouldRender ? children : placeholder}
        </div>
    );
}
