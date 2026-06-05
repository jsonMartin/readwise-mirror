const filenamify = (str: string, _options?: { replacement?: string }) => 
  str.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');

export default filenamify;
