/** CSS Modules 声明：样式文件默认导出类名到哈希名的只读映射。 */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
