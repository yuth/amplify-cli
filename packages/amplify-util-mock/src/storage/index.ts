import { StorageTest } from './storage';
const MOCK_SUPPORTED_CATEGORY = ['S3'];
const RESOURCE_NEEDS_PUSH = ['Cognito'];

export async function start(context) {
    const resources = await context.amplify.getResourceStatus();
    const mockableResources = resources.allResources.filter(
        resource => resource.service && MOCK_SUPPORTED_CATEGORY.includes(resource.service)
    );
    const resourceToBePushed = [...resources.resourcesToBeCreated].filter(
        resource => resource.service && RESOURCE_NEEDS_PUSH.includes(resource.service)
    );

    if (mockableResources.length) {
        if (resourceToBePushed.length) {
            context.print.info(
                'S3 Mocking needs Auth resources to be pushed to the cloud. Please run `amplify auth push` before running storage mock'
            );
            return Promise.resolve(false);
        }
        const testApi = new StorageTest();
        try {
            testApi.start(context);
        } catch (e) {
            console.log(e);
            // Sending term signal so we clean up after ourself
            process.kill(process.pid, 'SIGTERM');
        }
    }
}
