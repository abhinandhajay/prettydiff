import { Component, type ReactNode } from "react";

interface Props {
    children: ReactNode;
    fallback: ReactNode;
    onError?: () => void;
}

interface State {
    hasError: boolean;
}

export class DiffErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: unknown) {
        console.error("Diff renderer failed to render:", error);
        this.props.onError?.();
    }

    render() {
        return this.state.hasError ? this.props.fallback : this.props.children;
    }
}
