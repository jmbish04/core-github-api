import * as ts from 'typescript';
const program = ts.createProgram(["src/ai/agents/ResearchAgent/todo_integration/WebSearch.ts"], {
  noEmit: true,
  target: ts.ScriptTarget.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Node10
});
const sourceFile = program.getSourceFile("src/ai/agents/ResearchAgent/todo_integration/WebSearch.ts");
const checker = program.getTypeChecker();
function visit(node: ts.Node) {
  if (ts.isIdentifier(node) && node.text === "Env") {
    const symbol = checker.getSymbolAtLocation(node);
    if (symbol && symbol.declarations && symbol.declarations.length > 0) {
      console.log("Env declaration found at:");
      symbol.declarations.forEach(d => {
        console.log(d.getSourceFile().fileName);
      });
    }
  }
  ts.forEachChild(node, visit);
}
if(sourceFile) visit(sourceFile);
