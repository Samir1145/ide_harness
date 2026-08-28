import { injectable, inject } from '@theia/core/shared/inversify';
import { VariableContribution, VariableRegistry } from '@theia/variable-resolver/lib/browser/variable';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { EditorManager } from '@theia/editor/lib/browser';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class HayagrivaVariableContribution implements VariableContribution {
    constructor(
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(EditorManager) protected readonly editorManager: EditorManager
    ) {}

    registerVariables(variables: VariableRegistry): void {
        // 1. ${caseName} - Path to the active case folder
        variables.registerVariable({
            name: 'caseName',
            description: 'The absolute directory path of the active case workspace',
            resolve: () => {
                const ws = this.workspaceService.getWorkspaceRootUri(undefined);
                if (ws) {
                    return decodeURIComponent(new URI(ws.toString()).path.toString());
                }
                return '';
            }
        });

        // 2. ${memoryDirectory} - Path to the case wiki & knowledge base
        variables.registerVariable({
            name: 'memoryDirectory',
            description: 'The wiki and knowledge repository directory path for the active case',
            resolve: () => {
                const ws = this.workspaceService.getWorkspaceRootUri(undefined);
                if (ws) {
                    const casePath = decodeURIComponent(new URI(ws.toString()).path.toString());
                    return `${casePath}/wiki`;
                }
                return '';
            }
        });

        // 3. ${activeFile} - Path to the currently focused editor file
        variables.registerVariable({
            name: 'activeFile',
            description: 'The filesystem path of the currently active document in the editor',
            resolve: () => {
                const currentEditor = this.editorManager.currentEditor;
                if (currentEditor && currentEditor.editor && currentEditor.editor.uri) {
                    return decodeURIComponent(currentEditor.editor.uri.path.toString());
                }
                return '';
            }
        });

        // 4. ${activeConcept} - Basename of active concept card
        variables.registerVariable({
            name: 'activeConcept',
            description: 'The title/basename of the currently focused concept card',
            resolve: () => {
                const currentEditor = this.editorManager.currentEditor;
                if (currentEditor && currentEditor.editor && currentEditor.editor.uri) {
                    const p = currentEditor.editor.uri.path.toString();
                    if (p.includes('/concepts/')) {
                        return currentEditor.editor.uri.path.name;
                    }
                }
                return '';
            }
        });
    }
}
