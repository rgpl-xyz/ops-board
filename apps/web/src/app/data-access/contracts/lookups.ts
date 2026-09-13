export interface TeamDto {
  id: string;
  name: string;
}

export interface LookupUserDto {
  id: string;
  displayName: string;
  teamId: string;
}
