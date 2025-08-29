import { z } from 'zod';
/**
 * HTTP Call Template schema for RESTful HTTP/HTTPS API tools.
 * Extends the base CallTemplate and defines HTTP-specific configuration.
 */
export declare const HttpCallTemplateSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
} & {
    call_template_type: z.ZodLiteral<"http">;
    http_method: z.ZodDefault<z.ZodEnum<["GET", "POST", "PUT", "DELETE", "PATCH"]>>;
    url: z.ZodString;
    content_type: z.ZodDefault<z.ZodString>;
    auth: z.ZodOptional<z.ZodDiscriminatedUnion<"auth_type", [z.ZodObject<{
        auth_type: z.ZodLiteral<"api_key">;
        api_key: z.ZodString;
        var_name: z.ZodDefault<z.ZodString>;
        location: z.ZodDefault<z.ZodEnum<["header", "query", "cookie"]>>;
    }, "strip", z.ZodTypeAny, {
        auth_type: "api_key";
        api_key: string;
        var_name: string;
        location: "header" | "query" | "cookie";
    }, {
        auth_type: "api_key";
        api_key: string;
        var_name?: string | undefined;
        location?: "header" | "query" | "cookie" | undefined;
    }>, z.ZodObject<{
        auth_type: z.ZodLiteral<"basic">;
        username: z.ZodString;
        password: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        auth_type: "basic";
        username: string;
        password: string;
    }, {
        auth_type: "basic";
        username: string;
        password: string;
    }>, z.ZodObject<{
        auth_type: z.ZodLiteral<"oauth2">;
        token_url: z.ZodString;
        client_id: z.ZodString;
        client_secret: z.ZodString;
        scope: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        auth_type: "oauth2";
        token_url: string;
        client_id: string;
        client_secret: string;
        scope?: string | undefined;
    }, {
        auth_type: "oauth2";
        token_url: string;
        client_id: string;
        client_secret: string;
        scope?: string | undefined;
    }>]>>;
    headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    body_field: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    header_fields: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    timeout: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    call_template_type: "http";
    http_method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    url: string;
    content_type: string;
    body_field: string;
    timeout: number;
    auth?: {
        auth_type: "api_key";
        api_key: string;
        var_name: string;
        location: "header" | "query" | "cookie";
    } | {
        auth_type: "basic";
        username: string;
        password: string;
    } | {
        auth_type: "oauth2";
        token_url: string;
        client_id: string;
        client_secret: string;
        scope?: string | undefined;
    } | undefined;
    headers?: Record<string, string> | undefined;
    header_fields?: string[] | undefined;
    name?: string | undefined;
}, {
    call_template_type: "http";
    url: string;
    http_method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | undefined;
    content_type?: string | undefined;
    auth?: {
        auth_type: "api_key";
        api_key: string;
        var_name?: string | undefined;
        location?: "header" | "query" | "cookie" | undefined;
    } | {
        auth_type: "basic";
        username: string;
        password: string;
    } | {
        auth_type: "oauth2";
        token_url: string;
        client_id: string;
        client_secret: string;
        scope?: string | undefined;
    } | undefined;
    headers?: Record<string, string> | undefined;
    body_field?: string | undefined;
    header_fields?: string[] | undefined;
    timeout?: number | undefined;
    name?: string | undefined;
}>;
export type HttpCallTemplate = z.infer<typeof HttpCallTemplateSchema>;
