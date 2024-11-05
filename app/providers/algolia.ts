import { searchClient } from '@algolia/client-search';
import 'dotenv/config';

const algoliaClient = searchClient(process.env.ALGOLIA_APP_ID!, process.env.ALGOLIA_API_KEY!);

export default algoliaClient;
