import type { MetadataRisk } from '../types';
export async function inspectMetadata(file: Blob): Promise<MetadataRisk[]> {
    const exifr = await import('exifr');
    const tags = await exifr.parse(file);
    if (!tags) return [];
    const result: MetadataRisk[] = [];
    if (['GPSLatitude','GPSLongitude','latitude','longitude','GPSInfoIFDPointer'].some(k=>tags[k]!=null)) result.push({type:'Location',description:'GPS location metadata detected'});
    if (['DateTime','DateTimeOriginal','CreateDate','ModifyDate'].some(k=>tags[k]!=null)) result.push({type:'Date and time',description:'Capture or edit time metadata detected'});
    if (['Make','Model','LensModel','BodySerialNumber'].some(k=>tags[k]!=null)) result.push({type:'Device',description:'Device information detected'});
    if (['Software','ProcessingSoftware','CreatorTool'].some(k=>tags[k]!=null)) result.push({type:'Software',description:'Software information detected'});
    return result;
}
