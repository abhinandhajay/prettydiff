import { useEffect, useRef, useState } from "react";

const MOUNT_MARGIN = "800px 0px";
const UNMOUNT_MARGIN = "3000px 0px";

interface Props {
    estimatedHeight: number;
    forceMount?: boolean;
    children: React.ReactNode;
}

export function LazyDiffBody({ estimatedHeight, forceMount, children }: Props) {
    const [mounted, setMounted] = useState<boolean>(Boolean(forceMount));
    const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (forceMount) setMounted(true);
    }, [forceMount]);

    useEffect(() => {
        if (forceMount) return;
        const node = wrapperRef.current;
        if (!node) return;

        const mountObserver = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        setMounted(true);
                        return;
                    }
                }
            },
            { rootMargin: MOUNT_MARGIN },
        );
        const unmountObserver = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) setMounted(false);
                }
            },
            { rootMargin: UNMOUNT_MARGIN },
        );

        mountObserver.observe(node);
        unmountObserver.observe(node);
        return () => {
            mountObserver.disconnect();
            unmountObserver.disconnect();
        };
    }, [forceMount]);

    useEffect(() => {
        if (!mounted) return;
        const node = contentRef.current;
        if (!node) return;
        const ro = new ResizeObserver(() => {
            const h = node.getBoundingClientRect().height;
            if (h > 0) setMeasuredHeight(h);
        });
        ro.observe(node);
        return () => ro.disconnect();
    }, [mounted]);

    return (
        <div ref={wrapperRef}>
            {mounted ? (
                <div ref={contentRef}>{children}</div>
            ) : (
                <div aria-hidden style={{ minHeight: measuredHeight ?? estimatedHeight }} />
            )}
        </div>
    );
}
