update-openapi:
    curl -o openapi/management-open-api.yaml https://raw.githubusercontent.com/lakekeeper/lakekeeper/refs/heads/main/docs/docs/api/management-open-api.yaml

update-openapi-catalog:
    curl -o openapi/rest-catalog-open-api.yaml https://raw.githubusercontent.com/lakekeeper/lakekeeper/refs/heads/main/docs/docs/api/rest-catalog-open-api.yaml

generate-management-client:
    npx @hey-api/openapi-ts -i openapi/management-open-api.yaml -o src/gen/management -c @hey-api/client-fetch

generate-iceberg-client:
    npx @hey-api/openapi-ts -i openapi/rest-catalog-open-api.yaml -o src/gen/iceberg -c @hey-api/client-fetch
