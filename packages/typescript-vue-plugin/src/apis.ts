import type * as vueTs from '@volar/vue-typescript';
import type * as ts from 'typescript/lib/tsserverlibrary';

export function register(
	vueLsCtx: vueTs.LanguageServiceContext,
	vueTsLs: ts.LanguageService,
) {

	return {
		getCompletionsAtPosition,
		getDefinitionAtPosition,
		getDefinitionAndBoundSpan,
		getTypeDefinitionAtPosition,
		getImplementationAtPosition,
		findRenameLocations,
		getReferencesAtPosition,
		findReferences,
	};

	// apis
	function getCompletionsAtPosition(fileName: string, position: number, options: ts.GetCompletionsAtPositionOptions | undefined): ReturnType<ts.LanguageService['getCompletionsAtPosition']> {
		const finalResult = vueTsLs.getCompletionsAtPosition(fileName, position, options);
		if (finalResult) {
			finalResult.entries = finalResult.entries.filter(entry => entry.name.indexOf('__VLS_') === -1);
		}
		return finalResult;
	}
	function getReferencesAtPosition(fileName: string, position: number): ReturnType<ts.LanguageService['getReferencesAtPosition']> {
		return findLocations(fileName, position, 'references') as ts.ReferenceEntry[];
	}
	function getDefinitionAtPosition(fileName: string, position: number): ReturnType<ts.LanguageService['getDefinitionAtPosition']> {
		return findLocations(fileName, position, 'definition') as ts.DefinitionInfo[];
	}
	function getTypeDefinitionAtPosition(fileName: string, position: number): ReturnType<ts.LanguageService['getDefinitionAtPosition']> {
		return findLocations(fileName, position, 'typeDefinition') as ts.DefinitionInfo[];
	}
	function getImplementationAtPosition(fileName: string, position: number): ReturnType<ts.LanguageService['getImplementationAtPosition']> {
		return findLocations(fileName, position, 'implementation') as ts.ImplementationLocation[];
	}
	function findRenameLocations(fileName: string, position: number, findInStrings: boolean, findInComments: boolean, providePrefixAndSuffixTextForRename?: boolean): ReturnType<ts.LanguageService['findRenameLocations']> {
		return findLocations(fileName, position, 'rename', findInStrings, findInComments, providePrefixAndSuffixTextForRename) as ts.RenameLocation[];
	}
	function findLocations(
		fileName: string,
		position: number,
		mode: 'definition' | 'typeDefinition' | 'references' | 'implementation' | 'rename',
		findInStrings = false,
		findInComments = false,
		providePrefixAndSuffixTextForRename?: boolean
	) {

		const tsLs = vueTsLs;
		const loopChecker = new Set<string>();
		let symbols: (ts.DefinitionInfo | ts.ReferenceEntry | ts.ImplementationLocation | ts.RenameLocation)[] = [];

		if (tsLs)
			withTeleports(fileName, position, tsLs);

		return symbols.map(s => transformDocumentSpanLike(s)).filter(notEmpty);

		function withTeleports(fileName: string, position: number, tsLs: ts.LanguageService) {
			if (loopChecker.has(fileName + ':' + position))
				return;
			loopChecker.add(fileName + ':' + position);
			const _symbols = mode === 'definition' ? tsLs.getDefinitionAtPosition(fileName, position)
				: mode === 'typeDefinition' ? tsLs.getTypeDefinitionAtPosition(fileName, position)
					: mode === 'references' ? tsLs.getReferencesAtPosition(fileName, position)
						: mode === 'implementation' ? tsLs.getImplementationAtPosition(fileName, position)
							: mode === 'rename' ? tsLs.findRenameLocations(fileName, position, findInStrings, findInComments, providePrefixAndSuffixTextForRename)
								: undefined;
			if (!_symbols) return;
			symbols = symbols.concat(_symbols);
			for (const ref of _symbols) {
				loopChecker.add(ref.fileName + ':' + ref.textSpan.start);
				const teleport = vueLsCtx.sourceFiles.getTeleport(ref.fileName);

				if (!teleport)
					continue;

				for (const [teleRange] of teleport.findTeleports(
					ref.textSpan.start,
					ref.textSpan.start + ref.textSpan.length,
					sideData => {
						if ((mode === 'definition' || mode === 'typeDefinition' || mode === 'implementation') && !sideData.capabilities.definitions)
							return false;
						if ((mode === 'references') && !sideData.capabilities.references)
							return false;
						if ((mode === 'rename') && !sideData.capabilities.rename)
							return false;
						return true;
					},
				)) {
					if (loopChecker.has(ref.fileName + ':' + teleRange.start))
						continue;
					withTeleports(ref.fileName, teleRange.start, tsLs);
				}
			}
		}
	}
	function getDefinitionAndBoundSpan(fileName: string, position: number): ReturnType<ts.LanguageService['getDefinitionAndBoundSpan']> {

		const tsLs = vueTsLs;
		const loopChecker = new Set<string>();
		let textSpan: ts.TextSpan | undefined;
		let symbols: ts.DefinitionInfo[] = [];

		if (tsLs)
			withTeleports(fileName, position, tsLs);

		if (!textSpan) return;
		return {
			textSpan: textSpan,
			definitions: symbols?.map(s => transformDocumentSpanLike(s)).filter(notEmpty),
		};

		function withTeleports(fileName: string, position: number, tsLs: ts.LanguageService) {
			if (loopChecker.has(fileName + ':' + position))
				return;
			loopChecker.add(fileName + ':' + position);
			const _symbols = tsLs.getDefinitionAndBoundSpan(fileName, position);
			if (!_symbols) return;
			if (!textSpan) {
				textSpan = _symbols.textSpan;
			}
			if (!_symbols.definitions) return;
			symbols = symbols.concat(_symbols.definitions);
			for (const ref of _symbols.definitions) {

				loopChecker.add(ref.fileName + ':' + ref.textSpan.start);

				const teleport = vueLsCtx.sourceFiles.getTeleport(ref.fileName);
				if (!teleport)
					continue;

				for (const [teleRange] of teleport.findTeleports(
					ref.textSpan.start,
					ref.textSpan.start + ref.textSpan.length,
					sideData => !!sideData.capabilities.definitions,
				)) {
					if (loopChecker.has(ref.fileName + ':' + teleRange.start))
						continue;
					withTeleports(ref.fileName, teleRange.start, tsLs);
				}
			}
		}
	}
	function findReferences(fileName: string, position: number): ReturnType<ts.LanguageService['findReferences']> {

		const tsLs = vueTsLs;
		const loopChecker = new Set<string>();
		let symbols: ts.ReferencedSymbol[] = [];

		if (tsLs)
			withTeleports(fileName, position, tsLs);

		return symbols.map(s => transformReferencedSymbol(s)).filter(notEmpty);

		function withTeleports(fileName: string, position: number, tsLs: ts.LanguageService) {
			if (loopChecker.has(fileName + ':' + position))
				return;
			loopChecker.add(fileName + ':' + position);
			const _symbols = tsLs.findReferences(fileName, position);
			if (!_symbols) return;
			symbols = symbols.concat(_symbols);
			for (const symbol of _symbols) {
				for (const ref of symbol.references) {

					loopChecker.add(ref.fileName + ':' + ref.textSpan.start);

					const teleport = vueLsCtx.sourceFiles.getTeleport(ref.fileName);
					if (!teleport)
						continue;

					for (const [teleRange] of teleport.findTeleports(
						ref.textSpan.start,
						ref.textSpan.start + ref.textSpan.length,
						sideData => !!sideData.capabilities.references,
					)) {
						if (loopChecker.has(ref.fileName + ':' + teleRange.start))
							continue;
						withTeleports(ref.fileName, teleRange.start, tsLs);
					}
				}
			}
		}
	}

	// transforms
	function transformReferencedSymbol(symbol: ts.ReferencedSymbol): ts.ReferencedSymbol | undefined {
		const definition = transformDocumentSpanLike(symbol.definition);
		const references = symbol.references.map(r => transformDocumentSpanLike(r)).filter(notEmpty);
		if (definition) {
			return {
				definition,
				references,
			};
		}
		else if (references.length) { // TODO: remove patching
			return {
				definition: {
					...symbol.definition,
					fileName: references[0].fileName,
					textSpan: references[0].textSpan,
				},
				references,
			};
		}
	}
	function transformDocumentSpanLike<T extends ts.DocumentSpan>(documentSpan: T): T | undefined {
		const textSpan = transformSpan(documentSpan.fileName, documentSpan.textSpan);
		if (!textSpan) return;
		const contextSpan = transformSpan(documentSpan.fileName, documentSpan.contextSpan);
		const originalTextSpan = transformSpan(documentSpan.originalFileName, documentSpan.originalTextSpan);
		const originalContextSpan = transformSpan(documentSpan.originalFileName, documentSpan.originalContextSpan);
		return {
			...documentSpan,
			fileName: textSpan.fileName,
			textSpan: textSpan.textSpan,
			contextSpan: contextSpan?.textSpan,
			originalFileName: originalTextSpan?.fileName,
			originalTextSpan: originalTextSpan?.textSpan,
			originalContextSpan: originalContextSpan?.textSpan,
		};
	}
	function transformSpan(fileName: string | undefined, textSpan: ts.TextSpan | undefined) {
		if (!fileName) return;
		if (!textSpan) return;
		for (const vueLoc of vueLsCtx.sourceFiles.fromEmbeddedLocation(fileName, textSpan.start, textSpan.start + textSpan.length)) {
			return {
				fileName: vueLoc.fileName,
				textSpan: {
					start: vueLoc.range.start,
					length: vueLoc.range.end - vueLoc.range.start,
				},
			};
		}
	}
}

function notEmpty<T>(value: T | null | undefined): value is T {
	return value !== null && value !== undefined;
}
