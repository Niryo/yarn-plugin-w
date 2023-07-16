import {Plugin, Project, Configuration, structUtils} from '@yarnpkg/core';
import {BaseCommand} from '@yarnpkg/cli';
import {Option} from 'clipanion';
import chalk from 'chalk';
import {execSync} from 'child_process';
import inquirer from 'inquirer';
import inquirerPrompt from 'inquirer-autocomplete-prompt';
import Fuse from 'fuse.js';
import fs from 'fs';

class HelloWorldCommand extends BaseCommand {
  static paths = [
    [`w`],
  ];

  values = Option.Rest();

  async execute() {
    inquirer.registerPrompt('autocomplete', inquirerPrompt);

    const workspaceNameInput: string | undefined = this.values[0];
    const commandInput: string | undefined = this.values[1];

    const configuration = await Configuration.find(this.context.cwd, this.context.plugins);
    const {project} = await Project.find(configuration, this.context.cwd);
    const allWorkspaces = project.workspaces.map((workspace) => ({
      name: structUtils.stringifyIdent(workspace.manifest.name),
      location: workspace.relativeCwd,
    })).reduce((acc, {location, name}) => {
      acc[name] = location;
      return acc;
    }, {});

    const allWorkspacesNames = Object.keys(allWorkspaces);
    

    let workspaceName: string;
    if(allWorkspacesNames.length === 1 ) {
      workspaceName = allWorkspacesNames[0];
      // console.log(chalk.green(`Found workspace: ${workspaceName}`));
    } else {
      workspaceName = await getWorkspaceName(workspaceNameInput, allWorkspacesNames);
    }

    let script: string;
    if(commandInput) {
      script = commandInput;
    } else if(allWorkspacesNames.length === 1 && workspaceNameInput) {
      script = workspaceNameInput; //if there is only one workspace, we assume that the given command is actually the script and not the workspace name
    }  else {
      script = await askForScriptToRun(allWorkspaces[workspaceName]);
    }
    const commandToRun = script !== 'run' ? script : await askForCustomCommandToRun();

    const finalCommand = `yarn workspace ${workspaceName} ${commandToRun}`;
    console.log(chalk.green(`Running: ${finalCommand}`));
    execSync(finalCommand, {stdio: 'inherit'});
  }
}

async function askForCustomCommandToRun() {
  return (await inquirer.prompt({
    message: 'Run:',
    type: 'input',
    name: 'commandToRun',
  })).commandToRun;
}
async function askForScriptToRun(workspaceLocation: string) {
  const workspaceScripts = Object.keys(JSON.parse(fs.readFileSync(`${workspaceLocation}/package.json`, 'utf-8')).scripts || {});
  workspaceScripts.unshift('run');
  const fuseWorkspaceScripts = new Fuse(workspaceScripts, {ignoreLocation: true});
  return (await inquirer
    .prompt([
      {
        type: 'autocomplete',
        name: 'script',
        message: 'Script',
        source: (_answersSoFar: any, input: string) => {
          if (!input) {
            return workspaceScripts;
          }
          return fuseWorkspaceScripts.search(input).map(({item}) => item);
        },
      },
    ])).script;
}
async function getWorkspaceName(workspaceNameInput: string | undefined, workspacesNames: string[]) {
  const fuseWorkspaceNames = new Fuse(workspacesNames, {ignoreLocation: true});
  if (workspaceNameInput) {
    const foundName = fuseWorkspaceNames.search(workspaceNameInput)[0]?.item
    if (foundName) {
      console.log(chalk.green(`Found workspace: ${foundName}`));
      return foundName;
    } else {
      console.log(chalk.red(`Could not find workspace with the name of ${workspaceNameInput}, please select workspace from the list below:`));
    }
  }
  return (await inquirer
    .prompt([
      {
        type: 'autocomplete',
        name: 'workspaceName',
        message: 'Workspace',
        source: (_answersSoFar: any, input: string) => {
          if (!input) {
            return workspacesNames;
          }
          return fuseWorkspaceNames.search(input).map(({item}) => item);
        },
      },
    ])).workspaceName;
}


const plugin: Plugin = {
  commands: [
    HelloWorldCommand,
  ],
};

export default plugin;
