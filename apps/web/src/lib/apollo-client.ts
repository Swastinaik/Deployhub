import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
import authFetch from "@/app/lib/authFetch";

export const apolloClient = new ApolloClient({
  link: new HttpLink({
    uri: "/graphql",
    fetch: authFetch as any,
  }),
  cache: new InMemoryCache(),
});
