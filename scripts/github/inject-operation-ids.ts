import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

function toCamelCase(str: string): string {
    return str.replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase()).replace(/[^a-zA-Z0-9]/g, '');
}

function processFile(filePath: string) {
    let sourceText = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
        filePath,
        sourceText,
        ts.ScriptTarget.Latest,
        true
    );

    let modifications: { start: number; end: number; replacement: string }[] = [];

    function visit(node: ts.Node) {
        // Look for createRoute({ ... })
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'createRoute') {
            if (node.arguments.length === 1 && ts.isObjectLiteralExpression(node.arguments[0])) {
                const obj = node.arguments[0];
                
                // Check if operationId already exists
                const hasOperationId = obj.properties.some(p => 
                    p.name && ts.isIdentifier(p.name) && p.name.text === 'operationId'
                );
                
                if (!hasOperationId) {
                    let methodStr = '';
                    let pathStr = '';
                    
                    for (const prop of obj.properties) {
                        if (ts.isPropertyAssignment(prop) && prop.name && ts.isIdentifier(prop.name)) {
                            if (prop.name.text === 'method' && ts.isStringLiteral(prop.initializer)) {
                                methodStr = prop.initializer.text;
                            }
                            if (prop.name.text === 'path' && ts.isStringLiteral(prop.initializer)) {
                                pathStr = prop.initializer.text;
                            }
                        }
                    }
                    
                    if (methodStr && pathStr) {
                        // For example: get + /github/login => getGithubLogin
                        // Note: pathStr can contain {param} -> getGithubLoginParam
                        // Also pathStr might be just '/' -> getRoot or just get
                        let cleanPath = pathStr.replace(/[\{\}]/g, ''); // drop braces
                        if (cleanPath === '/' || cleanPath === '') {
                            cleanPath = 'Root';
                        }
                        const firstChar = cleanPath.charAt(0);
                        if (firstChar === '/') {
                            cleanPath = cleanPath.substring(1);
                        }
                        let opId = methodStr + '_' + cleanPath;
                        opId = toCamelCase(opId);
                        
                        // We will insert `operationId: '${opId}',\n` right after the opening brace of createRoute({
                        const startPos = obj.getStart() + 1; // right after `{`
                        modifications.push({
                            start: startPos,
                            end: startPos,
                            replacement: `\n    operationId: '${opId}',`
                        });
                    }
                }
            }
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    // Apply modifications from back to front
    modifications.sort((a, b) => b.start - a.start);
    let modifiedText = sourceText;
    for (const mod of modifications) {
        modifiedText = modifiedText.slice(0, mod.start) + mod.replacement + modifiedText.slice(mod.end);
    }

    if (modifiedText !== sourceText) {
        fs.writeFileSync(filePath, modifiedText, 'utf8');
        console.log(`Updated ${filePath} with ${modifications.length} operationId(s)`);
    }
}

function walkDir(dir: string) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            walkDir(fullPath);
        } else if (stat.isFile() && fullPath.endsWith('.ts')) {
            processFile(fullPath);
        }
    }
}

walkDir(path.resolve(process.cwd(), 'src/backend/src'));
