/**
 * @file frontend/src/components/tools/toolbox/AgentFactoryPage.tsx
 * @description Full-page shell for the Agent Factory Workshop toolbox tool.
 * Wraps the reusable AgentFactoryTool component in a scrollable, full-height layout.
 */
import { AgentFactoryTool } from "@/components/tools/AgentFactoryTool";

export default function AgentFactoryPage() {
    return (
        <div className="flex flex-col h-full w-full overflow-hidden p-4">
            <AgentFactoryTool />
        </div>
    );
}
