
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Tag, Link as LinkIcon, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import {
    TreeExpander,
    TreeIcon,
    TreeLabel,
    TreeNode,
    TreeNodeContent,
    TreeNodeTrigger,
    TreeProvider,
    TreeView,
} from "@/components/kibo-ui/tree";
import { Folder, FileText } from "lucide-react";

export default function TodoPage() {
    const [selectedTodo, setSelectedTodo] = useState<string | null>(null);
    const [isNewOpen, setIsNewOpen] = useState(false);

    // Todo State
    const [todos, setTodos] = useState<any[]>([]);
    const [newTitle, setNewTitle] = useState("");
    const [newContent, setNewContent] = useState("");

    useEffect(() => {
        fetch('/api/todos')
            .then(res => res.json())
            .then(data => {
                if (data.success) setTodos(data.todos);
            });
    }, []);

    const handleCreate = async () => {
        const res = await fetch('/api/todos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle, content: newContent })
        });
        const data = await res.json();
        if (data.success) {
            setTodos(prev => [{ id: data.id, title: newTitle, content: newContent, status: 'pending', tags: [] }, ...prev]);
            setIsNewOpen(false);
            setNewTitle("");
            setNewContent("");
        }
    };

    // Helper to group todos for Tree
    const pendingTodos = todos.filter(t => t.status === 'pending');
    const doneTodos = todos.filter(t => t.status === 'done');

    return (
        <div className="flex h-screen bg-background text-foreground">
            {/* Sidebar removed to correct duplication */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Top Bar */}
                <header className="h-14 border-b flex items-center px-4 justify-between bg-card/50 backdrop-blur">
                    <div className="flex items-center gap-2 w-1/3">
                        <Search className="w-4 h-4 text-muted-foreground" />
                        <Input placeholder="Search todos..." className="h-8 bg-transparent border-none focus-visible:ring-0" />
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm">
                            <Tag className="w-3 h-3 mr-2" />
                            Filter
                        </Button>
                        <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm">
                                    <Plus className="w-4 h-4 mr-2" />
                                    New Post-it
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
                                <DialogHeader>
                                    <DialogTitle>New Todo</DialogTitle>
                                </DialogHeader>
                                <div className="flex-1 flex flex-col gap-4 py-4">
                                    <div className="space-y-2">
                                        <Label>Title</Label>
                                        <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="What needs doing?" />
                                    </div>
                                    <div className="flex-1 border rounded-md p-1 overflow-hidden">
                                        {/* Editor Placeholder until installed */}
                                        <textarea
                                            className="w-full h-full p-4 bg-transparent border-none resize-none focus:outline-none"
                                            value={newContent}
                                            onChange={e => setNewContent(e.target.value)}
                                            placeholder="Write details..."
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button onClick={handleCreate}>Create Todo</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </header>

                {/* Main Content Areas */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left Pane: Tree */}
                    <aside className="w-64 border-r bg-muted/10 overflow-y-auto">
                        <div className="p-2">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Folders</h3>
                            <TreeProvider>
                                <TreeView>
                                    <TreeNode nodeId="pending">
                                        <TreeNodeTrigger>
                                            <TreeExpander hasChildren />
                                            <TreeIcon icon={<Folder className="w-4 h-4" />} />
                                            <TreeLabel>Pending</TreeLabel>
                                        </TreeNodeTrigger>
                                        <TreeNodeContent hasChildren>
                                            {pendingTodos.map(todo => (
                                                <TreeNode nodeId={todo.id} key={todo.id}>
                                                    <TreeNodeTrigger onClick={() => setSelectedTodo(todo.id)}>
                                                        <TreeExpander />
                                                        <TreeIcon icon={<FileText className="w-4 h-4" />} />
                                                        <TreeLabel>{todo.title}</TreeLabel>
                                                    </TreeNodeTrigger>
                                                </TreeNode>
                                            ))}
                                        </TreeNodeContent>
                                    </TreeNode>
                                    <TreeNode nodeId="done">
                                        <TreeNodeTrigger>
                                            <TreeExpander hasChildren />
                                            <TreeIcon icon={<Folder className="w-4 h-4" />} />
                                            <TreeLabel>Done</TreeLabel>
                                        </TreeNodeTrigger>
                                        <TreeNodeContent hasChildren>
                                            {doneTodos.map(todo => (
                                                <TreeNode nodeId={todo.id} key={todo.id}>
                                                    <TreeNodeTrigger onClick={() => setSelectedTodo(todo.id)}>
                                                        <TreeExpander />
                                                        <TreeIcon icon={<FileText className="w-4 h-4" />} />
                                                        <TreeLabel>{todo.title}</TreeLabel>
                                                    </TreeNodeTrigger>
                                                </TreeNode>
                                            ))}
                                        </TreeNodeContent>
                                    </TreeNode>
                                </TreeView>
                            </TreeProvider>
                        </div>
                    </aside>

                    {/* Middle: Editor/Details */}
                    <section className="flex-1 flex flex-col min-w-0 bg-background">
                        {selectedTodo ? (
                            <div className="flex-1 p-8 overflow-y-auto">
                                <div className="max-w-3xl mx-auto space-y-6">
                                    <h1 className="text-3xl font-bold">{todos.find(t => t.id === selectedTodo)?.title}</h1>
                                    <div className="flex gap-2">
                                        <Badge variant="secondary">Personal</Badge>
                                        <Badge variant="outline" className="text-muted-foreground">Normal Priority</Badge>
                                    </div>
                                    <div className="prose dark:prose-invert max-w-none">
                                        <p>{todos.find(t => t.id === selectedTodo)?.content}</p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-muted-foreground">
                                <div className="text-center">
                                    <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Sparkles className="w-6 h-6 text-foreground" />
                                    </div>
                                    <p>Select a todo to view details</p>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Right: AI Panel */}
                    {selectedTodo && (
                        <aside className="w-80 border-l bg-card/30 overflow-y-auto p-4">
                            <h3 className="font-semibold mb-4 flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-purple-500" />
                                AI Insights
                            </h3>
                            <div className="space-y-4">
                                {todos.find(t => t.id === selectedTodo)?.insights?.map((insight: any) => (
                                    <div key={insight.id} className="p-3 border rounded-lg bg-background/50 text-sm">
                                        <p className="mb-2">{insight.insight}</p>
                                        <div className="flex gap-2">
                                            <Button size="xs" variant="secondary">Take Action</Button>
                                        </div>
                                    </div>
                                ))}
                                {!todos.find(t => t.id === selectedTodo)?.insights?.length && (
                                    <p className="text-sm text-muted-foreground">No insights yet. AI is thinking...</p>
                                )}
                            </div>

                            <div className="mt-8">
                                <h3 className="font-semibold mb-4 flex items-center gap-2">
                                    <LinkIcon className="w-4 h-4" />
                                    Links
                                </h3>
                                <div className="space-y-2">
                                    {todos.find(t => t.id === selectedTodo)?.links?.map((link: any) => (
                                        <a href={link.href} target="_blank" rel="noopener noreferrer" key={link.id} className="block group">
                                            <div className="p-2 border rounded hover:bg-muted/50 transition-colors">
                                                <div className="font-medium text-sm truncate group-hover:text-primary">{link.url}</div>
                                                <div className="text-xs text-muted-foreground truncate">{link.content?.substring(0, 50)}...</div>
                                            </div>
                                        </a>
                                    ))}
                                    {!todos.find(t => t.id === selectedTodo)?.links?.length && (
                                        <p className="text-sm text-muted-foreground">No links found.</p>
                                    )}
                                </div>
                            </div>
                        </aside>
                    )}
                </div>
            </main>
        </div>
    );
}
