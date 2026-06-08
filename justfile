generate-clients: update-openapi-management update-openapi-catalog update-openapi-generic-table generate-management-client generate-iceberg-client generate-generic-table-client

update-openapi-management:
    curl -o openapi/management-open-api.yaml https://raw.githubusercontent.com/lakekeeper/lakekeeper/refs/heads/main/docs/docs/api/management-open-api.yaml

update-openapi-catalog:
    curl -o openapi/rest-catalog-open-api.yaml https://raw.githubusercontent.com/lakekeeper/lakekeeper/refs/heads/main/docs/docs/api/rest-catalog-open-api.yaml

update-openapi-generic-table:
    curl -o openapi/generic-table-open-api.yaml https://raw.githubusercontent.com/lakekeeper/lakekeeper/refs/heads/main/docs/docs/api/generic-table-open-api.yaml

generate-management-client:
    npx @hey-api/openapi-ts -i ./openapi/management-open-api.yaml -o ./src/gen/management -c @hey-api/client-fetch

generate-iceberg-client:
    npx @hey-api/openapi-ts -i ./openapi/rest-catalog-open-api.yaml -o ./src/gen/iceberg -c @hey-api/client-fetch

generate-generic-table-client:
    npx @hey-api/openapi-ts -i ./openapi/generic-table-open-api.yaml -o ./src/gen/generic-table -c @hey-api/client-fetch

reviewable: install fix-all build

install: 
    npm install

fix-lint: 
    npm run lint

check-lint: 
    npm run lint:check

dev: 
    npm run dev

build: 
    npm run build

format: 
    npm run format

check-format: 
    npm run format:check

check-all: check-format fix-lint

fix-all: format fix-lint
