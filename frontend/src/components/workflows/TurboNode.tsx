import { memo, type ReactNode } from 'react';
import { FiCloud } from 'react-icons/fi';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';

export type TurboNodeData = {
    title: string;
    icon?: ReactNode;
    subtitle?: string;
    color?: string; // e.g., 'blue', 'purple', 'green'
    topIcon?: ReactNode;
};

const gradients = {
    blue: "conic-gradient(from -160deg at 50% 50%, #2a8af6 0deg, #a853ba 120deg, #e92a67 240deg, #2a8af6 360deg)",
    purple: "conic-gradient(from -160deg at 50% 50%, #a853ba 0deg, #2a8af6 120deg, #e92a67 240deg, #a853ba 360deg)",
    green: "conic-gradient(from -160deg at 50% 50%, #22c55e 0deg, #2a8af6 120deg, #e92a67 240deg, #22c55e 360deg)",
    red: "conic-gradient(from -160deg at 50% 50%, #e92a67 0deg, #a853ba 120deg, #2a8af6 240deg, #e92a67 360deg)",
    yellow: "conic-gradient(from -160deg at 50% 50%, #eab308 0deg, #f97316 120deg, #e92a67 240deg, #eab308 360deg)",
};

export default memo(({ data }: NodeProps<Node<TurboNodeData>>) => {
    // Determine gradient based on color prop, default to blue/mixed
    const gradient = gradients[data.color as keyof typeof gradients] || gradients.blue;

    return (
        <>
            <div className="cloud gradient" style={{ '--node-gradient': gradient } as React.CSSProperties}>
                <div>
                    {data.topIcon || <FiCloud />}
                </div>
            </div>
            <div className="wrapper gradient" style={{ '--node-gradient': gradient } as React.CSSProperties}>
                <div className="inner">
                    <div className="body">
                        {data.icon && <div className="icon">{data.icon}</div>}
                        <div>
                            <div className="title">{data.title}</div>
                            {data.subtitle && <div className="subtitle">{data.subtitle}</div>}
                        </div>
                    </div>
                    <Handle type="target" position={Position.Left} />
                    <Handle type="source" position={Position.Right} />
                </div>
            </div>
        </>
    );
});
