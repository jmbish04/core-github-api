"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var ts = __importStar(require("typescript"));
var fs = __importStar(require("fs"));
var path = __importStar(require("path"));
function toCamelCase(str) {
    return str.replace(/[^a-zA-Z0-9]+(.)/g, function (m, chr) { return chr.toUpperCase(); }).replace(/[^a-zA-Z0-9]/g, '');
}
function processFile(filePath) {
    var sourceText = fs.readFileSync(filePath, 'utf8');
    var sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
    var modifications = [];
    function visit(node) {
        // Look for createRoute({ ... })
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'createRoute') {
            if (node.arguments.length === 1 && ts.isObjectLiteralExpression(node.arguments[0])) {
                var obj = node.arguments[0];
                // Check if operationId already exists
                var hasOperationId = obj.properties.some(function (p) {
                    return p.name && ts.isIdentifier(p.name) && p.name.text === 'operationId';
                });
                if (!hasOperationId) {
                    var methodStr = '';
                    var pathStr = '';
                    for (var _i = 0, _a = obj.properties; _i < _a.length; _i++) {
                        var prop = _a[_i];
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
                        var cleanPath = pathStr.replace(/[\{\}]/g, ''); // drop braces
                        if (cleanPath === '/' || cleanPath === '') {
                            cleanPath = 'Root';
                        }
                        var firstChar = cleanPath.charAt(0);
                        if (firstChar === '/') {
                            cleanPath = cleanPath.substring(1);
                        }
                        var opId = methodStr + '_' + cleanPath;
                        opId = toCamelCase(opId);
                        // We will insert `operationId: '${opId}',\n` right after the opening brace of createRoute({
                        var startPos = obj.getStart() + 1; // right after `{`
                        modifications.push({
                            start: startPos,
                            end: startPos,
                            replacement: "\n    operationId: '".concat(opId, "',")
                        });
                    }
                }
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    // Apply modifications from back to front
    modifications.sort(function (a, b) { return b.start - a.start; });
    var modifiedText = sourceText;
    for (var _i = 0, modifications_1 = modifications; _i < modifications_1.length; _i++) {
        var mod = modifications_1[_i];
        modifiedText = modifiedText.slice(0, mod.start) + mod.replacement + modifiedText.slice(mod.end);
    }
    if (modifiedText !== sourceText) {
        fs.writeFileSync(filePath, modifiedText, 'utf8');
        console.log("Updated ".concat(filePath, " with ").concat(modifications.length, " operationId(s)"));
    }
}
function walkDir(dir) {
    var files = fs.readdirSync(dir);
    for (var _i = 0, files_1 = files; _i < files_1.length; _i++) {
        var file = files_1[_i];
        var fullPath = path.join(dir, file);
        var stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            walkDir(fullPath);
        }
        else if (stat.isFile() && fullPath.endsWith('.ts')) {
            processFile(fullPath);
        }
    }
}
walkDir(path.resolve(process.cwd(), 'src/backend/src'));
