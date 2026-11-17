/**
 * @frameflow/project-engine - Command System & Undo/Redo Stack
 */

import type { ProjectModel, Command } from '../../shared-types/src/index.ts';

export class CommandManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private project: ProjectModel;
  private maxHistory: number;
  private changeListeners: Array<(project: ProjectModel) => void> = [];

  constructor(initialProject: ProjectModel, maxHistory = 50) {
    this.project = initialProject;
    this.maxHistory = maxHistory;
  }

  getProject(): ProjectModel {
    return this.project;
  }

  setProject(project: ProjectModel): void {
    this.project = project;
    this.undoStack = [];
    this.redoStack = [];
    this.notifyListeners();
  }

  subscribe(listener: (project: ProjectModel) => void): () => void {
    this.changeListeners.push(listener);
    return () => {
      this.changeListeners = this.changeListeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(): void {
    this.project.modifiedAt = Date.now();
    for (const listener of this.changeListeners) {
      listener(this.project);
    }
  }

  execute(command: Command, applyFn: (proj: ProjectModel) => void, undoFn: (proj: ProjectModel) => void): void {
    // Apply mutation
    applyFn(this.project);
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    // Clear redo on new action
    this.redoStack = [];
    this.notifyListeners();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(undoHandler: (command: Command, proj: ProjectModel) => void): Command | null {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;

    undoHandler(cmd, this.project);
    this.redoStack.push(cmd);
    this.notifyListeners();
    return cmd;
  }

  redo(redoHandler: (command: Command, proj: ProjectModel) => void): Command | null {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;

    redoHandler(cmd, this.project);
    this.undoStack.push(cmd);
    this.notifyListeners();
    return cmd;
  }
}
