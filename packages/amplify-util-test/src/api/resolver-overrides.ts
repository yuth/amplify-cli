import * as fs from 'fs-extra';
import * as path from 'path';
import * as chokidar from 'chokidar';

export class ResolverOverrides {
    private overrides: Set<string>;
    private contentMap: Map<string, string>;

    constructor(
        private _resolverTemplateRoot: string,
        private fileExtensions: string[] = ['.vtl']
    ) {
        this.overrides = new Set();
        this.contentMap = new Map();
        this.start();
    }

    start() {
        if (
            fs.existsSync(this.resolverTemplateRoot) &&
            fs.lstatSync(this.resolverTemplateRoot).isDirectory()
        ) {
            fs.readdirSync(this.resolverTemplateRoot)
                .map(f => path.join(this._resolverTemplateRoot, f))
                .filter(this.isTemplateFile.bind(this))
                .forEach(f => {
                    this.updateContentMap(f);
                    this.overrides.add(this.getRelativePath(f));
                });
        }
    }

    onFileChange(filePath: string) {
        if (!this.isTemplateFile(filePath)) {
            return false;
        }
        return this.updateContentMap(filePath);
    }

    sync(transformerResolvers: { path: string; content: string }[]) {
        const filesToWrite: Map<string, string> = new Map();
        const filesToDelete: Set<string> = new Set();
        const result: { path: string; content: string }[] = transformerResolvers.map(resolver => {
            const r = {
                path: resolver.path,
                content: ''
            };

            // Step 1: Check if the file is in the override map and if it really is
            // different from transformer generated file or its here because it was not
            // deleted from last execution
            if (this.overrides.has(resolver.path)) {
                const overriddenContent = this.contentMap.get(resolver.path);
                if (overriddenContent === resolver.content) {
                    this.overrides.delete(resolver.path);
                } else {
                    r.content = overriddenContent;
                }
            } else {
                // Step 2. The file is not in content map. Its a new created by transformer
                if (this.contentMap.has(resolver.path)) {
                    // existing file, not a newly created file
                    const diskFileContent = this.contentMap.get(resolver.path);
                    if (diskFileContent !== resolver.content) {
                        filesToWrite.set(resolver.path, resolver.content);
                    }
                } else {
                    // new resolver created by transformer
                    filesToWrite.set(resolver.path, resolver.content);
                }
                r.content = resolver.content;
            }
            return r;
        });

        // Populate the list of files that needs to be deleted
        const generatedResolverPath = transformerResolvers.map(r => r.path);
        this.contentMap.forEach((val, resolverPath) => {
            if (
                !this.overrides.has(resolverPath) &&
                !generatedResolverPath.includes(resolverPath)
            ) {
                filesToDelete.add(resolverPath);
            }
        });

        // Write files to disk
        filesToWrite.forEach((content, filePath) => {
            // Update the content in the map
            this.contentMap.set(filePath, content);
            fs.writeFileSync(this.getAbsPath(filePath), content);
        });

        // Delete the files that are no longer needed
        filesToDelete.forEach(filePath => {
            this.contentMap.delete(filePath);
            fs.unlinkSync(this.getAbsPath(filePath));
        });
        return result;
    }
    /**
     * Stop synchronizing resolver content. This will delete all the resolvers except for
     * the ones which are not overridden
     */
    stop() {
        this.contentMap.forEach((val, filePath) => {
            if (!this.overrides.has(filePath)) {
                fs.unlinkSync(this.getAbsPath(filePath));
            }
        });
    }

    private isTemplateFile(filePath: string): boolean {
        if (!this.fileExtensions.includes(path.extname(filePath))) {
            return false;
        }
        if (!filePath.includes(this.resolverTemplateRoot)) {
            return false;
        }

        if (fs.lstatSync(filePath).isFile()) {
            return true;
        }
        return false;
    }

    private updateContentMap(filePath: string) {
        const relativePath = this.getRelativePath(filePath);
        const content = fs.readFileSync(filePath).toString();
        if (this.contentMap.get(relativePath) !== content) {
            this.contentMap.set(relativePath, content);
            this.overrides.add(relativePath);
            return true;
        }
        return false;
    }

    private getRelativePath(filePath: string) {
        return path.relative(this.resolverTemplateRoot, filePath);
    }
    private getAbsPath(filename: string) {
        return path.normalize(path.join(this.resolverTemplateRoot, filename));
    }

    onAdd(path: string): boolean {
        return this.onFileChange(path);
    }

    onChange(path: string): boolean {
        return this.onFileChange(path);
    }
    onUnlink(path: string): boolean {
        const relativePath = this.getRelativePath(path);
        this.contentMap.delete(relativePath);
        if (this.overrides.has(relativePath)) {
            this.overrides.delete(relativePath);
            return true;
        }
        return false;
    }
    get resolverTemplateRoot() {
        return this._resolverTemplateRoot;
    }
}
