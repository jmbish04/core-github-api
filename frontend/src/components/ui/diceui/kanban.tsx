import React, { useMemo, useState } from 'react';
import { DndContext, DragOverlay, useDraggable, useDroppable } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils'; // Assuming standard Shadcn utils

// --- Types ---
export type KanbanColumn<T> = {
    id: string;
    title: string;
};

export type KanbanItem = {
    id: string;
    status: string;
    [key: string]: any;
};

interface KanbanBoardProps<T extends KanbanItem> {
    columns: KanbanColumn<T>[];
    data: T[];
    renderCard: (item: T) => React.ReactNode;
    onDragEnd: (activeId: string, overStatus: string) => void;
}

// --- Components ---

function KanbanCardWrapper({ id, children, isOverlay }: { id: string, children: React.ReactNode, isOverlay?: boolean }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
    const style = {
        transform: CSS.Translate.toString(transform),
    };

    if (isOverlay) {
        return <div className="cursor-grabbing scale-105 rotate-2 transition-transform">{children}</div>;
    }

    if (isDragging) {
        return <div ref={setNodeRef} style={style} className="opacity-50">{children}</div>;
    }

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing">
            {children}
        </div>
    );
}

function KanbanColumnDroppable({ id, title, children }: { id: string, title: string, children: React.ReactNode }) {
    const { setNodeRef } = useDroppable({ id });
    return (
        <div className="flex-1 min-w-[300px] flex flex-col h-full bg-zinc-900/30 rounded-lg border border-zinc-800/50">
            <div className="p-3 border-b border-zinc-800/50 bg-zinc-900/50 rounded-t-lg">
                <h3 className="text-sm font-medium text-zinc-400">{title}</h3>
            </div>
            <ScrollArea className="flex-1">
                <div ref={setNodeRef} className="p-3 space-y-3 min-h-[100px]">
                    {children}
                </div>
            </ScrollArea>
        </div>
    );
}

export function KanbanBoard<T extends KanbanItem>({ columns, data, renderCard, onDragEnd }: KanbanBoardProps<T>) {
    const [activeId, setActiveId] = useState<string | null>(null);

    const onDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (over && active.id !== over.id) {
            // Check if dropped on a column
            const overColumnId = over.id as string;
            // Or assume valid drop
            onDragEnd(active.id as string, overColumnId);
        }
    };

    const activeItem = useMemo(() => data.find(item => item.id === activeId), [activeId, data]);

    return (
        <DndContext onDragStart={onDragStart} onDragEnd={handleDragEnd}>
            <div className="flex gap-4 h-full overflow-x-auto pb-4">
                {columns.map(col => (
                    <KanbanColumnDroppable key={col.id} id={col.id} title={col.title}>
                        {data.filter(item => item.status === col.id).map(item => (
                            <KanbanCardWrapper key={item.id} id={item.id}>
                                {renderCard(item)}
                            </KanbanCardWrapper>
                        ))}
                    </KanbanColumnDroppable>
                ))}
            </div>
            {createPortal(
                <DragOverlay>
                    {activeItem && renderCard(activeItem)}
                </DragOverlay>,
                document.body
            )}
        </DndContext>
    );
}
