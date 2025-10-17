import * as vscode from 'vscode';
import { LMPEditorProvider } from './lmpEditor';
import { registerCommands } from './commands';

export function activate(context: vscode.ExtensionContext) {
	console.log('DoomGFX Tools extension activated');

	context.subscriptions.push(
		LMPEditorProvider.register(context)
	);

	registerCommands(context);

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(async e => {
			if (e.affectsConfiguration('doomgfxTools.palettePath') || 
			    e.affectsConfiguration('doomgfxTools.paletteIndex')) {
				
				const lmpTabs = vscode.window.tabGroups.all
					.flatMap(group => group.tabs)
					.filter(tab => {
						if (tab.input instanceof vscode.TabInputCustom) {
							return tab.input.uri.fsPath.toLowerCase().endsWith('.lmp');
						}
						return false;
					});

				if (lmpTabs.length === 0) {
					vscode.window.showInformationMessage('Palette configuration changed.');
					return;
				}

				const selection = await vscode.window.showInformationMessage(
					'Palette configuration changed, reopen files?',
					'Yes',
					'No'
				);

				if (selection !== 'Yes') {
					return;
				}

				const lmpUris = lmpTabs.map(tab => (tab.input as vscode.TabInputCustom).uri);

				for (const tab of lmpTabs) {
					await vscode.window.tabGroups.close(tab);
				}

				await new Promise(resolve => setTimeout(resolve, 100));

				for (const uri of lmpUris) {
					await vscode.commands.executeCommand('vscode.open', uri, { 
						preview: false,
						preserveFocus: false
					});
				}

				vscode.window.showInformationMessage(
					`Reloaded ${lmpUris.length} LMP file(s).`
				);
			}
		})
	);
}

export function deactivate() {}
