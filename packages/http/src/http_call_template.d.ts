import { z } from 'zod';
/**
 * HTTP Call Template schema for RESTful HTTP/HTTPS API tools.
 * Extends the base CallTemplate and defines HTTP-specific configuration.
 */
export declare const HttpCallTemplateSchema: z.ZodObject<{
    name: z.ZodDefault<z.ZodString>;
    call_template_type: z.ZodLiteral<"http">;
    http_method: z.ZodDefault<z.ZodEnum<{
        GET: "GET";
        POST: "POST";
        PUT: "PUT";
        DELETE: "DELETE";
        PATCH: "PATCH";
    }>>;
    url: z.ZodString;
    content_type: z.ZodDefault<z.ZodString>;
    auth: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        auth_type: z.ZodLiteral<"api_key">;
        api_key: z.ZodString;
        var_name: z.ZodDefault<z.ZodString>;
        location: z.ZodDefault<z.ZodEnum<{
            header: "header";
            query: "query";
            cookie: "cookie";
        }>>;
    }, z.core.$strip>, z.ZodObject<{
        auth_type: z.ZodLiteral<"basic">;
        username: z.ZodString;
        password: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        auth_type: z.ZodLiteral<"oauth2">;
        token_url: z.ZodString;
        client_id: z.ZodString;
        client_secret: z.ZodString;
        scope: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>], "auth_type">>;
    headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    body_field: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    header_fields: z.ZodOptional<z.ZodArray<z.ZodString>>;
    timeout: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type HttpCallTemplate = z.infer<typeof HttpCallTemplateSchema>;
