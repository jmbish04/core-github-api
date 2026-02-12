import React, { useCallback } from 'react';
import {
    ReactFlow,
    Controls,
    useNodesState,
    useEdgesState,
    addEdge,
    type Node,
    type Edge,
    type OnConnect,
    type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import './turbo.css';

import TurboNode from './TurboNode';
import TurboEdge from './TurboEdge';

const nodeTypes = {
    turbo: TurboNode,
};

const edgeTypes = {
    turbo: TurboEdge,
};

const defaultEdgeOptions = {
    type: 'turbo',
    markerEnd: 'edge-circle',
};

interface FlowProps {
    initialNodes: Node[];
    initialEdges: Edge[];
    selectedNodeId?: string;
    onNodeSelect?: (node: Node) => void;
}

const Flow = ({ initialNodes, initialEdges, selectedNodeId, onNodeSelect }: FlowProps) => {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    // Reset state when props change
    React.useEffect(() => {
        setNodes(initialNodes);
        setEdges(initialEdges);
    }, [initialNodes, initialEdges, setNodes, setEdges]);

    const onConnect: OnConnect = useCallback(
        (params) => setEdges((els) => addEdge(params, els)),
        [setEdges],
    );
    const onNodeClick: NodeMouseHandler = useCallback(
        (_event, node) => {
            onNodeSelect?.(node);
        },
        [onNodeSelect],
    );

    const renderedNodes = React.useMemo(
        () =>
            nodes.map((node) => ({
                ...node,
                selected: node.id === selectedNodeId,
            })),
        [nodes, selectedNodeId],
    );

    return (
        <div className="h-[600px] w-full border rounded-lg overflow-hidden bg-[rgb(17,17,17)]">
            <ReactFlow
                nodes={renderedNodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                fitView
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                defaultEdgeOptions={defaultEdgeOptions}
            >
                <Controls showInteractive={false} />
                <svg>
                    <defs>
                        <linearGradient id="edge-gradient">
                            <stop offset="0%" stopColor="#ae53ba" />
                            <stop offset="100%" stopColor="#2a8af6" />
                        </linearGradient>

                        <marker
                            id="edge-circle"
                            viewBox="-5 -5 10 10"
                            refX="0"
                            refY="0"
                            markerUnits="strokeWidth"
                            markerWidth="10"
                            markerHeight="10"
                            orient="auto"
                        >
                            <circle stroke="#2a8af6" strokeOpacity="0.75" r="2" cx="0" cy="0" />
                        </marker>
                    </defs>
                </svg>
            </ReactFlow>
        </div>
    );
};

export default Flow;
