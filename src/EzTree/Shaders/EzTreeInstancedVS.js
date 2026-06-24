export default `
in vec3 a_position;
in vec3 a_normal;
in vec2 a_st;
in float a_windWeight;
in vec3 a_instanceTranslation;
in vec3 a_instanceScale;
in vec2 a_instanceRotationWind;
in vec4 a_instanceColor;

uniform float u_time;
uniform vec2 u_windDirection;
uniform float u_windStrength;
uniform float u_windFrequency;
uniform float u_windScale;
uniform vec4 u_baseColor;
uniform vec3 u_instanceTranslationMinimum;
uniform vec3 u_instanceTranslationScale;
uniform vec3 u_instanceScaleMinimum;
uniform vec3 u_instanceScaleScale;

out vec3 v_normalEC;
out vec2 v_st;
out vec4 v_color;
out float v_windWeight;

vec3 ezTree_yUpToZUp(vec3 value)
{
    return vec3(value.x, value.z, value.y);
}

vec3 ezTree_rotateYaw(vec3 value, float c, float s)
{
    return vec3(
        c * value.x - s * value.y,
        s * value.x + c * value.y,
        value.z
    );
}

float ezTree_hash(vec2 value)
{
    return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
}

void main()
{
    vec3 instanceTranslation = u_instanceTranslationMinimum + a_instanceTranslation * u_instanceTranslationScale;
    vec3 instanceScale = u_instanceScaleMinimum + a_instanceScale * u_instanceScaleScale;
    vec3 position = ezTree_yUpToZUp(a_position) * instanceScale;
    vec3 normal = normalize(ezTree_yUpToZUp(a_normal));

    float rotation = a_instanceRotationWind.x * czm_twoPi;
    float c = cos(rotation);
    float s = sin(rotation);
    float windPhase = a_instanceRotationWind.y;
    float windMask = clamp(a_windWeight, 0.0, 1.0);
    if (u_windStrength > 0.0 && u_windFrequency > 0.0 && windMask > 0.0) {
        vec2 windDirection = normalize(u_windDirection);
        float windOffset = ezTree_hash(instanceTranslation.xy / max(u_windScale, 0.001) + windPhase) * czm_twoPi;
        float wind = sin(u_time * u_windFrequency + windOffset) *
            cos(u_time * 1.37 * u_windFrequency + windOffset * 0.73);
        position.xy += windDirection * (wind * u_windStrength * windMask * max(instanceScale.z, 0.1));
    }

    position = ezTree_rotateYaw(position, c, s);
    normal = ezTree_rotateYaw(normal, c, s);

    vec3 localPosition = position + instanceTranslation;
    v_normalEC = normalize(czm_normal * normal);
    v_st = a_st;
    v_color = a_instanceColor * u_baseColor;
    v_windWeight = windMask;

    gl_Position = czm_modelViewProjection * vec4(localPosition, 1.0);
}
`;
