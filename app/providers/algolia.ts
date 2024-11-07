import { searchClient } from '@algolia/client-search';

const algoliaClient = searchClient(process.env.ALGOLIA_APP_ID!, process.env.ALGOLIA_API_KEY!);

export default algoliaClient;
