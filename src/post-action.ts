// Copyright (c) 2020-2021 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as core from '@actions/core'
import { context, getOctokit } from "@actions/github"
import * as vcpkgaction from './vcpkg-action'
import * as actionlib from '@lukka/action-lib'
import * as baseutillib from '@lukka/base-util-lib'
import * as vcpkgutil from './vcpkg-utils'
import * as vcpkgpostaction from './vcpkg-post-action'

function getEnv(name?: string): string {
  if (!name || !process.env[name])
    throw new Error(`Value for '${name}' is not defined!`);
  return process.env[name] as string;
}

const enum JobConclusion {
  neutral,
  skipped,
  success,
  cancelled,
  timed_out,
  action_required,
  failure,
}

export async function isJobSucceeded(): Promise<boolean> {
  let status = false;
  const jobName: string = getEnv("GITHUB_JOB");
  const runId = parseInt(getEnv("GITHUB_RUN_ID"), 10);
  core.debug(`jobName=${jobName}.`);
  core.debug(`runId=${runId}.`);
  const octokit = getOctokit(core.getInput("gitHubToken"));
  const repository: string = getEnv("GITHUB_REPOSITORY");
  const [owner, repo] = repository.split("/");
  const jobsResponse = await octokit.rest.actions.getWorkflowRun({
    owner: owner, repo: repo, run_id: context.runId,
  });
  if (jobsResponse.status === 200) {
    core.debug(`w.conc=${jobsResponse.data.conclusion}`);
    core.debug(`w.status=${jobsResponse.data.status}`);
    core.debug(`w.id=${jobsResponse.data.id}`);
    core.debug(`w.id=${jobsResponse.data.name}`);
    core.debug(` `);
    status = jobsResponse.data.status === "success";

  } else {
    core.warning(`Failed to fetch jobs for workflow run ${context.runId} (HTTP code ${jobsResponse.status})`);
  }
  return Promise.resolve(status);
}

export async function main(): Promise<void> {
  try {
    const doNotCache = (core.getState(vcpkgaction.VCPKG_DO_NOT_CACHE_STATE) ?? false) === "true";
    const actionLib = new actionlib.ActionLib();
    const baseUtil = new baseutillib.BaseUtilLib(actionLib);

    const jobSucceeded: boolean = await isJobSucceeded();
    const doNotCacheOnWorkflowFailure: boolean = core.getInput(vcpkgaction.doNotCacheOnWorkflowFailureInput).toLowerCase() === 'true'
    const cacheHit: string = core.getState(vcpkgaction.VCPKG_KEY_CACHE_HIT_STATE);
    const computedCacheKey: baseutillib.KeySet = JSON.parse(core.getState(vcpkgaction.VCPKG_CACHE_COMPUTEDKEY_STATE)) as baseutillib.KeySet;
    const vcpkgRoot = core.getState(vcpkgaction.VCPKG_ROOT_STATE);
    const cachedPaths: string[] = vcpkgutil.Utils.getAllCachedPaths(actionLib, vcpkgRoot);

    const post = new vcpkgpostaction.VcpkgPostAction(baseUtil,
      jobSucceeded, doNotCache, doNotCacheOnWorkflowFailure,
      computedCacheKey, cachedPaths, cacheHit);
    await post.run();
  } catch (err) {
    const error: Error = err as Error;
    if (error?.stack) {
      core.info(error.stack);
    }
    const errorAsString = (err as Error)?.message ?? "undefined error";
    core.setFailed(`run-vcpkg post-action execution failed: ${errorAsString}`);
    process.exitCode = -1000;
  }
}

// Main entry point of the task.
main().catch(error => console.error("main() failed!", error));
