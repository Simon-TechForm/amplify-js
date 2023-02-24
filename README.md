## Patching aws-amplify

We've created a fork of aws-amplify at https://github.com/Simon-TechForm/amplify-js which should be used when patching.

Creating a new patch:

- Sync the fork on github
- Sync the tags:
  - Add the "original" repo as upstream (should be done already): `git remote add upstream https://github.com/aws-amplify/amplify-js`
  - Fetch new tags from upstream: `git fetch --tags upstream`
  - Push the new tags to the fork: `git push --tags`
- Find the latest release tag, and note the SHA of the commit immediately after named `Update version.ts`
  - NOTE: Using the commit instead of the tag prevents an uncommited file after building
- Branch out of the commit: `git checkout -b <new-branch-name> <commit-sha>`
- Checkout to `new-react-native-patch`
- merge the newly created branch that matches the installed dependency version into the existing branch: `git merge <newly-created-branch-name>`
  - **NOTE**: Check if any changes have been made to `AWSPinpointProvider.ts`
  - **NOTE**: Check if `packages/analytics/package.json` has changed its entry points (they are generating a `dist` folder, which currently isn't part of the package)
- Fix potential merge conflicts and update the patch
- Commit and push to the branch
- Run `yarn build` and copy the output `.js` files of the patched packages into your react native project
  - Remember to copy both `lib` and `lib-esm`
