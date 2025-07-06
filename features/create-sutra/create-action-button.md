## Task

In file app/components/UploadActionButtons.tsx please create a new action button
called `create sutra`, When i click this button, there will be a popup window
show up, on the popup window, there will be a table shows the sutra id and name.
on the id column, there will be a copy icon let user copy the id of the sutra.
The sutra list can be found from file app/services/sutra.service.ts, if you can
not find appropriate function, you have to create by yourself. The table height
should only be the popup window height 50%, if more than that, it should be
scrollable. Below the table, you have to create a form that allow user to create
new sutra, you can reference the schema in this file 'drizzle/tables/sutra.ts'
There is a schema validation created for you already app/validations/sutra.validation.ts
make sure the create function in the service file as well if not present.
